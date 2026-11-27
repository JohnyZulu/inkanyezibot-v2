"""Milestone 2 step 2a — multi-connection race tests on REAL PostgreSQL 16.

These are the merge gates that need two sessions genuinely blocking each other:
  R1  two concurrent "yes" for the same quote → exactly one checkout intent
  R2  cancellation (replacement) commits first, payment on the old link second
  R3  payment commits first, replacement second
  R4  the same late-payment event applied concurrently twice → one owner exception, 0 fulfilment
  R5  concurrent model-budget reservations never exceed the cap
  R6  concurrent turn claims respect the concurrency cap
  R7  a lease that expires while its holder is mid-transaction cannot commit
  R8  lock-order regression: replacement holds the conversation lock and waits on the payment
      attempt while the payment transaction's paid-confirmation insert needs the conversation —
      must NOT deadlock (conversation lock is FOR NO KEY UPDATE, compatible with FK KEY SHARE)
Each race also checks that NO deadlock occurred (both sessions finish cleanly).

Usage (never touches Supabase or Paystack; creates a scratch database, then drops it):
  python3 tests/whatsapp-postgres-2a.py                     # local psql via PGHOST/PGPORT/PGUSER
  python3 tests/whatsapp-postgres-2a.py --container NAME    # psql inside a PG16 Docker container (as M1 tests)
"""
import argparse
import json
import os
import pathlib
import queue
import secrets
import subprocess
import threading
import time
import unittest

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--container', default=None)
args, REST = parser.parse_known_args()
ROOT = pathlib.Path(__file__).resolve().parents[1]
DB = 'wa2a_' + secrets.token_hex(5)
FILES = ['001_commerce_core', '002_commerce_tests', '003_seed_test_store', '005_whatsapp_agent', '006_whatsapp_tests']


def command(db, name='wa2a'):
    base = ['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', os.environ.get('PGUSER', 'postgres'), '-d', db]
    if args.container:
        return ['docker', 'exec', '-e', 'PGAPPNAME=' + name, '-i', args.container] + base
    return ['env', 'PGAPPNAME=' + name] + base


def sql(statement, db=DB):
    r = subprocess.run(command(db), input=statement, text=True, capture_output=True, timeout=60)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()


def j(statement):
    return json.loads(sql(statement))


class Session:
    def __init__(self, name):
        self.name = name
        self.p = subprocess.Popen(command(DB, name), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.STDOUT, text=True, bufsize=1)
        self.lines = queue.Queue()
        threading.Thread(target=self._pump, daemon=True).start()

    def _pump(self):
        for line in self.p.stdout:
            self.lines.put(line.rstrip('\n'))
        self.lines.put(None)

    def send(self, statement):
        self.p.stdin.write(statement + '\n\\echo __END__\n')
        self.p.stdin.flush()

    def result(self, timeout=20):
        out = []
        while True:
            line = self.lines.get(timeout=timeout)
            if line is None or line == '__END__':
                return '\n'.join(out)
            out.append(line)

    def poll(self):
        """Non-blocking: the finished result, or None if the statement is still running."""
        self.__dict__.setdefault('_buf', [])
        while True:
            try:
                line = self.lines.get_nowait()
            except queue.Empty:
                return None
            if line is None or line == '__END__':
                out, self._buf = '\n'.join(self._buf), []
                return out
            self._buf.append(line)

    def close(self):
        try:
            self.p.stdin.write('rollback;\n\\q\n')
            self.p.stdin.flush()
            self.p.wait(timeout=5)
        except Exception:
            self.p.kill()
        for f in (self.p.stdin, self.p.stdout):
            try:
                f.close()
            except Exception:
                pass


def wait_blocked(name, timeout=10):
    """True once session `name` is waiting on a lock (proves a real race, not a sequence)."""
    end = time.time() + timeout
    while time.time() < end:
        if sql(f"select count(*) from pg_stat_activity where application_name='{name}' and wait_event_type='Lock';") == '1':
            return True
        time.sleep(0.05)
    return False


def drain_committing(sessions, timeout=30):
    """Collect each blocked session's result in WHATEVER order PostgreSQL releases them,
    committing each as soon as it finishes (lock queues are not FIFO by session index)."""
    pending, results, end = dict(enumerate(sessions)), {}, time.time() + timeout
    while pending:
        if time.time() > end:
            raise AssertionError(f'sessions still blocked: {list(pending)} (deadlock?)')
        for i, s in list(pending.items()):
            out = s.poll()
            if out is not None:
                results[i] = json.loads(out)
                s.send('commit;'); s.result()
                del pending[i]
        time.sleep(0.02)
    return [results[i] for i in sorted(results)]


SEQ = iter(range(10_000))


def sender():
    return '2783' + str(1000000 + next(SEQ))


def checkout(email):
    """A committed open checkout for a new sender. Returns dict from commerce.wa_t_checkout."""
    s = sender()
    tag = secrets.token_hex(4)
    out = j(f"select commerce.wa_t_checkout('{s}', 'W-A', 1, '{email}', '{tag}');")
    out['sender'] = s
    return out


def replacement_quote(c, sku='W-B', qty=1):
    """New turn for the same sender, add an item, issue a quote that replaces the open checkout.
    Committed. Returns (turn_id, token, quote)."""
    conv = c['conv']
    sql(f"select commerce.wa_t_msg('{c['sender']}', 'wamid.rep.{secrets.token_hex(4)}', 'add one');")
    t = j(f"select commerce.wa_t_turn('{conv}');")
    tid, tok = t['turn_id'], t['lease_token']
    sql(f"select public.commerce_wa_cart_set_item('{tid}', '{tok}', '{sku}', {qty});")
    q = j(f"select public.commerce_wa_create_quote('{tid}', '{tok}');")
    assert q['replaces']['intent_id'] == c['intent_id'], q
    return tid, tok, q


def count(where_sql):
    return int(sql(f"select count(*) from {where_sql};"))


class Races(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sql(f'create database {DB};', db='postgres')
        sql("do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then "
            "create role service_role; create role anon; create role authenticated; end if; end $$;")
        for f in FILES:
            sql((ROOT / 'supabase' / f'{f}.sql').read_text())
        if not os.environ.get('WA2A_SKIP_SUITES'):          # (mutation testing runs the races on their own)
            assert sql("select count(*) from commerce.run_core_tests() where not passed;") == '0'
            assert sql("select count(*) from commerce.run_whatsapp_tests() where not passed;") == '0'
        sql("""
          insert into commerce.stores (slug, name, owner_name, flat_delivery_cents, reservation_minutes)
          values ('zz-wa-race', 'Race Store', 'Owner', 9900, 30);
          insert into commerce.products (store_id, sku, name, price_cents, currency, on_hand)
          select id, v.sku, v.sku, v.p, 'ZAR', 1000 from commerce.stores, (values ('W-A',125000),('W-B',50000)) v(sku,p)
           where slug = 'zz-wa-race';
          insert into commerce.wa_channels (store_id, phone_number_id) select id, '999000111' from commerce.stores where slug='zz-wa-race';
        """)

    @classmethod
    def tearDownClass(cls):
        sql(f"select pg_terminate_backend(pid) from pg_stat_activity where datname = '{DB}' and pid <> pg_backend_pid();",
            db='postgres')
        sql(f'drop database {DB};', db='postgres')

    def tearDown(self):
        # A failed race can leave a backend blocked inside an open transaction after its psql
        # client was killed; terminate it so one failure can't cascade into the next test.
        sql(f"select pg_terminate_backend(pid) from pg_stat_activity where datname = '{DB}' "
            "and application_name ~ '^r[0-9]' and pid <> pg_backend_pid();")

    def test_r1_concurrent_yes_same_quote_one_intent(self):
        s = sender()
        conv = j(f"select commerce.wa_t_msg('{s}', 'wamid.r1.{s}', 'buy');")['conversation_id']
        t = j(f"select commerce.wa_t_turn('{conv}');")
        tid, tok = t['turn_id'], t['lease_token']
        for stmt in [f"select public.commerce_wa_cart_set_item('{tid}','{tok}','W-A',1);",
                     f"select public.commerce_wa_cart_set_delivery('{tid}','{tok}','{{\"method\":\"collect\"}}');",
                     f"select public.commerce_wa_set_contact_email('{tid}','{tok}','r1@example.com');",
                     f"select public.commerce_wa_confirm_contact_email('{tid}','{tok}','r1@example.com');"]:
            sql(stmt)
        q = j(f"select public.commerce_wa_create_quote('{tid}','{tok}');")
        call = f"select public.commerce_wa_confirm_quote('{tid}','{tok}','{q['quote_id']}',{q['total_cents']});"
        a, b = Session('r1a'), Session('r1b')
        try:
            a.send('begin;'); a.result()
            a.send(call); ra = json.loads(a.result())
            b.send('begin;'); b.result()
            b.send(call)
            self.assertTrue(wait_blocked('r1b'), 'second yes must wait for the first')
            a.send('commit;'); a.result()
            rb = json.loads(b.result())
            b.send('commit;'); b.result()
        finally:
            a.close(); b.close()
        self.assertTrue(ra['ok'] and not ra['replayed'], ra)
        self.assertTrue(rb['ok'] and rb['replayed'] and rb['intent_id'] == ra['intent_id'], rb)
        self.assertEqual(count(f"commerce.wa_checkout_intents where conversation_id = '{conv}'"), 1)
        self.assertEqual(count(f"commerce.wa_order_owners w join commerce.wa_checkout_intents i on i.order_id = w.order_id "
                               f"where i.conversation_id = '{conv}'"), 1)

    def test_r2_cancel_wins_then_payment(self):
        c = checkout('r2@example.com')
        tid, tok, q = replacement_quote(c)
        old_order = c['order_id']
        a, b = Session('r2a'), Session('r2b')
        try:
            a.send('begin;'); a.result()
            a.send(f"select public.commerce_wa_confirm_quote('{tid}','{tok}','{q['quote_id']}',{q['total_cents']});")
            ra = json.loads(a.result())
            b.send('begin;'); b.result()
            b.send(f"select public.commerce_apply_verified_payment('{c['reference']}','success',125000,'ZAR','txn-r2','webhook');")
            self.assertTrue(wait_blocked('r2b'), 'payment must wait for the cancellation')
            a.send('commit;'); a.result()
            rb = json.loads(b.result())
            b.send('commit;'); b.result()
        finally:
            a.close(); b.close()
        self.assertTrue(ra['ok'], ra)
        self.assertEqual(rb['outcome'], 'paid_after_cancel', rb)
        self.assertEqual(sql(f"select status from commerce.orders where id = '{old_order}';"), 'cancelled')
        self.assertEqual(sql(f"select status from commerce.payment_attempts where reference = '{c['reference']}';"), 'succeeded')
        self.assertEqual(count(f"commerce.handoff_tasks where order_id = '{old_order}' and kind = 'paid_after_cancel'"), 1)
        self.assertEqual(count(f"commerce.handoff_tasks where order_id = '{old_order}' and kind = 'pack_order'"), 0)
        self.assertEqual(count(f"commerce.jobs where dedup_key = 'notify_paid:{old_order}'"), 0)
        self.assertEqual(count(f"commerce.wa_outbox where dedup_key = 'paid:{old_order}'"), 0)
        self.assertEqual(sql(f"select status from commerce.wa_checkout_intents where id = '{c['intent_id']}';"), 'paid_after_cancel')
        self.assertEqual(sql(f"select status from commerce.wa_checkout_intents where id = '{ra['intent_id']}';"), 'awaiting_url')
        self.assertEqual(count(f"commerce.stock_reservations where order_id = '{old_order}' and status = 'active'"), 0)

    def test_r3_payment_wins_then_replacement(self):
        c = checkout('r3@example.com')
        tid, tok, q = replacement_quote(c)
        old_order = c['order_id']
        a, b = Session('r3a'), Session('r3b')
        try:
            a.send('begin;'); a.result()
            a.send(f"select public.commerce_apply_verified_payment('{c['reference']}','success',125000,'ZAR','txn-r3','webhook');")
            ra = json.loads(a.result())
            b.send('begin;'); b.result()
            b.send(f"select public.commerce_wa_confirm_quote('{tid}','{tok}','{q['quote_id']}',{q['total_cents']});")
            self.assertTrue(wait_blocked('r3b'), 'replacement must wait for the payment')
            a.send('commit;'); a.result()
            rb = json.loads(b.result())
            b.send('commit;'); b.result()
        finally:
            a.close(); b.close()
        self.assertEqual(ra['outcome'], 'applied', ra)
        self.assertEqual(rb.get('code'), 'old_checkout_paid', rb)
        self.assertEqual(sql(f"select status from commerce.wa_checkout_quotes where id = '{q['quote_id']}';"), 'refused_paid')
        self.assertEqual(sql(f"select status from commerce.orders where id = '{old_order}';"), 'confirmed')
        self.assertEqual(sql(f"select status from commerce.wa_checkout_intents where id = '{c['intent_id']}';"), 'paid')
        self.assertEqual(count(f"commerce.wa_checkout_intents where conversation_id = '{c['conv']}'"), 1)
        self.assertEqual(count(f"commerce.wa_outbox where dedup_key = 'paid:{old_order}'"), 1)
        self.assertEqual(count(f"commerce.handoff_tasks where order_id = '{old_order}' and kind = 'pack_order'"), 1)
        # a replay of the same "yes" afterwards is refused too
        again = j(f"select public.commerce_wa_confirm_quote('{tid}','{tok}','{q['quote_id']}',{q['total_cents']});")
        self.assertEqual(again.get('code'), 'quote_not_current', again)

    def test_r4_repeated_late_payment_concurrently(self):
        c = checkout('r4@example.com')
        tid, tok, q = replacement_quote(c)
        self.assertTrue(j(f"select public.commerce_wa_confirm_quote('{tid}','{tok}','{q['quote_id']}',{q['total_cents']});")['ok'])
        old_order = c['order_id']
        call = f"select public.commerce_apply_verified_payment('{c['reference']}','success',125000,'ZAR','txn-r4','webhook');"
        a, b = Session('r4a'), Session('r4b')
        try:
            a.send('begin;'); a.result(); a.send(call); ra = json.loads(a.result())
            b.send('begin;'); b.result(); b.send(call)
            self.assertTrue(wait_blocked('r4b'))
            a.send('commit;'); a.result()
            rb = json.loads(b.result()); b.send('commit;'); b.result()
        finally:
            a.close(); b.close()
        self.assertEqual({ra['outcome'], rb['outcome']}, {'paid_after_cancel', 'duplicate'})
        self.assertEqual(count(f"commerce.handoff_tasks where order_id = '{old_order}' and kind = 'paid_after_cancel'"), 1)
        self.assertEqual(count(f"commerce.handoff_tasks where order_id = '{old_order}' and kind = 'pack_order'"), 0)
        self.assertEqual(count(f"commerce.wa_outbox where dedup_key = 'paid:{old_order}'"), 0)

    def test_r5_budget_cap_under_concurrency(self):
        sql("update commerce.wa_settings set daily_model_cap_micro_usd = 2000000 "
            "where store_id = (select id from commerce.stores where slug='zz-wa-race');")
        sql("delete from commerce.wa_model_reservations; delete from commerce.wa_model_budget;")
        turns = []
        for _ in range(6):
            s = sender()
            conv = j(f"select commerce.wa_t_msg('{s}', 'wamid.r5.{s}', 'hi');")['conversation_id']
            t = j(f"select commerce.wa_t_turn('{conv}');")
            turns.append((t['turn_id'], t['lease_token']))
        sessions = [Session(f'r5_{i}') for i in range(6)]
        try:
            for i, (tid, tok) in enumerate(turns):
                sessions[i].send('begin;'); sessions[i].result()
                sessions[i].send(f"select public.commerce_wa_reserve_model_spend('{tid}','{tok}',900000);")
            first = json.loads(sessions[0].result())
            for i in range(1, 6):
                self.assertTrue(wait_blocked(f'r5_{i}'), 'all reservations must contend on the budget row')
            sessions[0].send('commit;'); sessions[0].result()
            results = [first] + drain_committing(sessions[1:])
        finally:
            for s in sessions:
                s.close()
        self.assertEqual(sum(1 for r in results if r.get('ok')), 2, results)
        self.assertEqual(sum(1 for r in results if r.get('code') == 'budget_exhausted'), 4, results)
        b = sql("select reserved_micro_usd + spent_micro_usd from commerce.wa_model_budget;")
        self.assertEqual(int(b), 1800000)
        self.assertEqual(count("commerce.handoff_tasks where kind = 'wa_budget_exhausted'"), 1)

    def test_r6_turn_claims_respect_concurrency_cap(self):
        sql("update commerce.wa_conversations set turn_lease_until = null, turn_lease_token = null, current_turn_id = null;")
        sql("update commerce.wa_inbound set answered_at = now() where answered_at is null;")
        for _ in range(5):
            s = sender()
            sql(f"select commerce.wa_t_msg('{s}', 'wamid.r6.{s}', 'hi');")
        sessions = [Session(f'r6_{i}') for i in range(5)]
        try:
            for s in sessions:
                s.send('begin;'); s.result()
            sessions[0].send("select public.commerce_wa_claim_turn(null, 60, 2);")
            first = json.loads(sessions[0].result())
            for s in sessions[1:]:
                s.send("select public.commerce_wa_claim_turn(null, 60, 2);")
            for i in range(1, 5):
                self.assertTrue(wait_blocked(f'r6_{i}'), 'claims must queue on the claim lock')
            sessions[0].send('commit;'); sessions[0].result()
            results = [first] + drain_committing(sessions[1:])
        finally:
            for s in sessions:
                s.close()
        claimed = [r for r in results if r['claimed']]
        self.assertEqual(len(claimed), 2, results)
        self.assertEqual(len({r['conversation_id'] for r in claimed}), 2)
        self.assertEqual(sum(1 for r in results if r.get('reason') == 'concurrency_limit'), 3, results)

    def test_r7_lease_expires_mid_transaction(self):
        sql("update commerce.wa_conversations set turn_lease_until = null, turn_lease_token = null, current_turn_id = null;")
        s = sender()
        conv = j(f"select commerce.wa_t_msg('{s}', 'wamid.r7.{s}', 'hi');")['conversation_id']
        t = j(f"select public.commerce_wa_claim_turn('{conv}', 10, 50);")   # 10s lease
        tid, tok = t['turn_id'], t['lease_token']
        sql(f"update commerce.wa_conversations set turn_lease_until = clock_timestamp() + interval '1 second' where id = '{conv}';")
        time.sleep(1.5)
        sql(f"select commerce.wa_t_msg('{s}', 'wamid.r7b.{s}', 'still there?');")
        r = j(f"select public.commerce_wa_complete_turn('{tid}','{tok}','[{{\"purpose\":\"reply\",\"text\":\"late\"}}]');")
        self.assertEqual(r.get('code'), 'lease_lost', r)
        self.assertEqual(count(f"commerce.wa_outbox where turn_id = '{tid}'"), 0)
        self.assertEqual(count(f"commerce.wa_inbound where conversation_id = '{conv}' and answered_at is null"), 2)
        t2 = j(f"select public.commerce_wa_claim_turn('{conv}', 60, 50);")
        self.assertTrue(t2['claimed'] and len(t2['message_ids']) == 2, t2)

    def test_r8_no_deadlock_conversation_vs_payment(self):
        c = checkout('r8@example.com')
        tid, tok, q = replacement_quote(c)
        a, b = Session('r8a'), Session('r8b')
        try:
            a.send('begin;'); a.result()
            a.send(f"select 1 from commerce.payment_attempts where reference = '{c['reference']}' for update;"); a.result()
            b.send('begin;'); b.result()
            b.send(f"select public.commerce_wa_confirm_quote('{tid}','{tok}','{q['quote_id']}',{q['total_cents']});")
            self.assertTrue(wait_blocked('r8b'), 'replacement must hold the conversation and wait on the attempt')
            a.send(f"select public.commerce_apply_verified_payment('{c['reference']}','success',125000,'ZAR','txn-r8','webhook');")
            ra = json.loads(a.result(timeout=15))          # a deadlock would surface here as an ERROR line
            a.send('commit;'); a.result()
            rb = json.loads(b.result())
            b.send('commit;'); b.result()
        finally:
            a.close(); b.close()
        self.assertEqual(ra['outcome'], 'applied', ra)
        self.assertEqual(rb.get('code'), 'old_checkout_paid', rb)
        self.assertEqual(count(f"commerce.wa_outbox where dedup_key = 'paid:{c['order_id']}'"), 1)

    def test_r9_late_settlement_overlaps_turn_recovery(self):
        sql("delete from commerce.wa_model_reservations; delete from commerce.wa_model_budget;")
        s = sender()
        conv = j(f"select commerce.wa_t_msg('{s}', 'wamid.r9.{s}', 'hi');")['conversation_id']
        t = j(f"select commerce.wa_t_turn('{conv}');")
        tid, tok = t['turn_id'], t['lease_token']
        reservations = {}
        for amount in (200000, 300000, 400000):
            r = j(f"select public.commerce_wa_reserve_model_spend('{tid}', '{tok}', {amount});")
            self.assertTrue(r['ok'], r)
            reservations[r['reservation_id']] = amount
        sql(f"update commerce.wa_conversations set turn_lease_until = clock_timestamp() - interval '1 second' "
            f"where id = '{conv}';")

        # Hold the last reservation in recovery's lock order. Recovery may lock the others
        # first, but must leave the budget row free so settlement can finish.
        last_id = max(reservations)
        settler, recovery = Session('r9_settle'), Session('r9_recover')
        try:
            settler.send('begin;'); settler.result()
            settler.send(f"select id from commerce.wa_model_reservations where id = '{last_id}' for update;")
            self.assertEqual(settler.result(), last_id)
            recovery.send('begin;'); recovery.result()
            recovery.send(f"select commerce.wa_t_turn('{conv}');")
            self.assertTrue(wait_blocked('r9_recover'), 'recovery must wait for the locked reservation')

            settler.send(f"select public.commerce_wa_settle_model_spend('{last_id}', 50000);")
            result = settler.result()
            self.assertTrue(result.startswith('{'), result)
            settled = json.loads(result)
            settler.send('commit;'); settler.result()
            result = recovery.result()
            self.assertTrue(result.startswith('{'), result)
            reclaimed = json.loads(result)
            recovery.send('commit;'); recovery.result()
        finally:
            settler.close(); recovery.close()

        self.assertTrue(settled['ok'] and not settled['replayed'], settled)
        self.assertTrue(reclaimed['claimed'] and reclaimed['turn_id'] != tid, reclaimed)
        self.assertEqual(reclaimed['message_ids'], t['message_ids'])
        self.assertEqual(sql(f"select status from commerce.wa_turns where id = '{tid}';"), 'abandoned')
        recovered_id = min(reservations)
        replay = j(f"select public.commerce_wa_settle_model_spend('{recovered_id}', 10000);")
        self.assertTrue(replay['ok'] and replay['replayed'], replay)
        reservations[last_id] = 50000
        self.assertEqual(j(f"select jsonb_object_agg(id, actual_micro_usd) "
                           f"from commerce.wa_model_reservations where turn_id = '{tid}' and status = 'settled';"),
                         reservations)
        self.assertEqual(j("select jsonb_build_object('reserved', sum(reserved_micro_usd), 'spent', sum(spent_micro_usd)) "
                           "from commerce.wa_model_budget;"),
                         {'reserved': 0, 'spent': sum(reservations.values())})


if __name__ == '__main__':
    unittest.main(argv=['x'] + REST, verbosity=2)
