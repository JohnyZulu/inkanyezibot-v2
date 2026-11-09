"""Multi-connection regression checks. Requires Python's stdlib and a disposable PG16 Docker container.

python tests/commerce-postgres-review.py [--container commerce-review-pg16]
Runs the canonical supabase/ SQL.
Creates a unique scratch database, then drops it. Never connects to Supabase or Paystack.
"""
import argparse
import json
import pathlib
import queue
import secrets
import subprocess
import threading
import time
import unittest

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--container', default='commerce-review-pg16')
args = parser.parse_args()
ROOT = pathlib.Path(__file__).resolve().parents[1]
DOCKER = ['env', '-u', 'DOCKER_HOST', '-u', 'DOCKER_CONTEXT', '-u', 'DOCKER_TLS',
          '-u', 'DOCKER_TLS_VERIFY', '-u', 'DOCKER_CERT_PATH', 'docker',
          '--host=unix:///var/run/docker.sock']
DB = 'commerce_review_' + secrets.token_hex(5)


def command(db, name='commerce-review'):
    return DOCKER + ['exec', '-e', 'PGAPPNAME=' + name, '-i', args.container,
                     'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db]


def sql(statement, db=DB):
    result = subprocess.run(command(db), input=statement, text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


class Session:
    def __init__(self, name):
        self.name = name
        self.process = subprocess.Popen(command(DB, name), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.STDOUT, text=True, bufsize=1)
        self.lines = queue.Queue()
        def pump():
            for line in self.process.stdout:
                self.lines.put(line.rstrip())
            self.lines.put(None)
        self.thread = threading.Thread(target=pump, daemon=True)
        self.thread.start()

    def send(self, statement):
        self.process.stdin.write(statement + '\n')
        self.process.stdin.flush()

    def until(self, marker):
        lines = []
        while True:
            line = self.lines.get(timeout=12)
            if line is None or line == marker:
                return lines
            lines.append(line)

    def close(self):
        if self.process.poll() is None:
            try:
                self.send('rollback;\n\\q')
                self.process.wait(timeout=5)
            except (BrokenPipeError, subprocess.TimeoutExpired):
                self.process.terminate()
                self.process.wait(timeout=5)
        self.thread.join(timeout=2)
        self.process.stdin.close()
        self.process.stdout.close()


def wait_locked(session):
    for _ in range(80):
        if sql(f"select count(*) from pg_stat_activity where application_name='{session.name}' "
               "and wait_event_type='Lock';") == '1':
            return
        if session.process.poll() is not None:
            raise AssertionError('session exited before waiting: ' + session.name)
        time.sleep(.03)
    raise AssertionError('session did not wait for a lock: ' + session.name)


def fixture(slug, items=1, units=5):
    sql(f"insert into commerce.stores(slug,name,owner_name) values('{slug}','Review','Test Owner'); "
        "insert into commerce.products(store_id,sku,name,price_cents,currency,on_hand) "
        f"select id,'R-'||n,'Review',100,'ZAR',{units} from commerce.stores "
        f"cross join generate_series(1,{items}) n where slug='{slug}';")
    cart = json.dumps([dict(sku=f'R-{n}', qty=1) for n in range(1, items + 1)])
    def create(email):
        return f"select public.commerce_create_order('{slug}', '{{\"email\":\"{email}@example.com\"}}', " \
               f"'{cart}', '{{\"method\":\"collect\"}}');"
    order = json.loads(sql(create('first')))
    attempt = json.loads(sql(f"select public.commerce_start_payment_attempt('{order['order_id']}');"))
    return order, attempt, create


def apply(attempt):
    return f"select public.commerce_apply_verified_payment('{attempt['reference']}','success'," \
           f"{attempt['amount_cents']},'ZAR','test-txn','review');"


class CommerceReview(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sql("do $$ begin " + ''.join(
            f"if not exists(select 1 from pg_roles where rolname='{role}') then create role {role}; end if; "
            for role in ('anon', 'authenticated', 'service_role')) + "end $$;", db='postgres')
        sql(f'create database {DB};', db='postgres')
        sql('alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;')
        folder = ROOT / 'supabase'
        sql((folder / '001_commerce_core.sql').read_text())
        sql((folder / '002_commerce_tests.sql').read_text())
        print('\nSource:', folder, '\nEngine:', sql('select version();'), flush=True)

    @classmethod
    def tearDownClass(cls):
        sql(f'drop database {DB} with (force);', db='postgres')

    def session(self, name):
        session = Session(name)
        self.addCleanup(session.close)
        return session

    def isolate_attempts(self):
        sql("update commerce.payment_attempts set created_at=clock_timestamp();")

    def test_00_core_suite_and_privileges(self):
        rows = [json.loads(row) for row in sql('select row_to_json(t) from commerce.run_core_tests() t;').splitlines()]
        for row in rows:
            print(row['test'], row['passed'], flush=True)
        self.assertEqual(len(rows), 24)
        self.assertTrue(all(row['passed'] is True for row in rows))
        self.assertEqual(sql('select count(*) from commerce.stores; select count(*) from commerce.orders;'), '0\n0')
        self.assertEqual(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace, "
                             "pg_roles r where n.nspname='public' and p.proname like 'commerce\\_%' "
                             "and r.rolname in ('anon','authenticated') and has_function_privilege(r.oid,p.oid,'execute');"), '0')
        self.assertEqual(sql("select has_schema_privilege('anon','commerce','usage') "
                             "or has_schema_privilege('authenticated','commerce','usage');"), 'f')
        self.assertEqual(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
                             "where n.nspname='public' and p.proname like 'commerce\\_%' "
                             "and (not p.prosecdef or not coalesce('search_path=commerce, pg_temp'=any(p.proconfig),false));"), '0')

    def test_10_s1_uncommitted_allocation_blocks_new_buyer_after_expiry(self):
        order, attempt, create = fixture('review-s1', units=1)
        sql(f"update commerce.stock_reservations set expires_at=clock_timestamp()+interval '2 seconds' "
            f"where order_id='{order['order_id']}';")
        payment, buyer = self.session('s1-payment'), self.session('s1-buyer')
        payment.send('begin; ' + apply(attempt) + '\n\\echo APPLIED')
        self.assertIn('"outcome": "applied"', '\n'.join(payment.until('APPLIED')))
        time.sleep(2.1)
        buyer.send(create('second') + '\n\\echo BOUGHT')
        # Observe either the correct product-lock wait or the broken early commit, then release.
        for _ in range(30):
            if not buyer.lines.empty():
                break
            if sql("select count(*) from pg_stat_activity where application_name='s1-buyer' and wait_event_type='Lock';") == '1':
                break
            time.sleep(.03)
        payment.send('commit;\n\\echo COMMITTED')
        payment.until('COMMITTED')
        result = '\n'.join(buyer.until('BOUGHT'))
        print('S1 buyer:', result, flush=True)
        self.assertIn('insufficient_stock', result)

    def test_11_s2_payment_uses_wall_clock_after_competing_buyer_commits(self):
        order, attempt, create = fixture('review-s2', units=1)
        sql(f"update commerce.stock_reservations set expires_at=clock_timestamp()+interval '1 second' "
            f"where order_id='{order['order_id']}';")
        payment = self.session('s2-payment')
        payment.send('begin; select now();\n\\echo STARTED')
        payment.until('STARTED')
        time.sleep(1.1)
        self.assertTrue(json.loads(sql(create('second')))['ok'])
        payment.send(apply(attempt) + 'commit;\n\\echo APPLIED')
        result = '\n'.join(payment.until('APPLIED'))
        print('S2 payment:', result, flush=True)
        self.assertIn('"on_hold": true', result)
        self.assertIn('stock_unavailable_after_payment', sql(
            f"select exception_flags from commerce.orders where id='{order['order_id']}';"))

    def test_20_rotation_survives_worker_deferrals(self):
        self.isolate_attempts()
        order, attempt, _ = fixture('review-rotation')
        sql("insert into commerce.payment_attempts(store_id,order_id,attempt_no,reference,amount_cents,currency) "
            "select store_id,order_id,n,'ROT-'||n,amount_cents,currency from commerce.payment_attempts "
            f"cross join generate_series(2,3) n where reference='{attempt['reference']}'; "
            f"update commerce.payment_attempts set created_at=now()-interval '10 minutes' where order_id='{order['order_id']}';")
        checked = []
        # Mirror a worker with time for one timed-out verify per run: claim one, verify, release.
        for _ in range(8):
            claim = json.loads(sql('select row_to_json(c) from public.commerce_claim_reconcile_attempt(60) c;'))
            checked.append(claim['reference'])
            sql(f"select public.commerce_release_reconcile_claim('{claim['reference']}', '{claim['claim_token']}');")
        print('Rotation verified references:', checked, flush=True)
        self.assertEqual(len(set(checked)), 3, 'one-per-run worker must rotate through every eligible attempt')

    def test_21_overlapping_workers_cannot_claim_in_flight_verification(self):
        self.isolate_attempts()
        _, attempt, _ = fixture('review-overlap')
        sql("update commerce.payment_attempts set created_at=now()-interval '10 minutes' "
            f"where reference='{attempt['reference']}';")
        first, second = self.session('claim-first'), self.session('claim-second')
        first.send('begin; select reference from public.commerce_claim_reconcile_attempt(60);\n\\echo CLAIMED')
        claimed = first.until('CLAIMED')
        second.send('select reference from public.commerce_claim_reconcile_attempt(60);\n\\echo DURING')
        during = second.until('DURING')
        first.send('commit;\n\\echo COMMITTED')
        first.until('COMMITTED')
        # RPC has committed but first worker's external verification has not finished.
        second.send('select reference from public.commerce_claim_reconcile_attempt(60);\n\\echo AFTER')
        after = second.until('AFTER')
        print('Overlapping claims:', dict(first=claimed, during=during, after=after), flush=True)
        self.assertNotIn(attempt['reference'], during)
        self.assertNotIn(attempt['reference'], after, 'row locks do not survive the claim RPC; need an expiring lease')

    def test_30_expiry_and_multiline_payment_have_consistent_reservation_lock_order(self):
        order, attempt, _ = fixture('review-deadlock', items=2)
        # Insert physically high UUID first: expiry's scan order opposes payment's UUID order.
        sql(f"delete from commerce.stock_reservations where order_id='{order['order_id']}';")
        for sku, reservation_id in [('R-1', 'ffffffff-ffff-ffff-ffff-fffffffffff1'),
                                    ('R-2', '00000000-0000-0000-0000-000000000001')]:
            sql("insert into commerce.stock_reservations(id,store_id,product_id,order_id,qty,status,expires_at) "
                f"select '{reservation_id}',o.store_id,oi.product_id,o.id,1,'active',clock_timestamp()-interval '1 minute' "
                "from commerce.orders o join commerce.order_items oi on oi.order_id=o.id "
                f"where o.id='{order['order_id']}' and oi.sku='{sku}';")
        # This test-only trigger controls scheduling, not the production functions or lock order.
        sql("""create function commerce.review_pause_expiry() returns trigger language plpgsql as $$ begin
          if current_setting('application_name')='expiry-worker'
             and old.id='ffffffff-ffff-ffff-ffff-fffffffffff1' then
            perform pg_advisory_xact_lock(912345);
          end if;
          return new;
        end $$;
        create trigger review_pause_expiry before update on commerce.stock_reservations
          for each row execute function commerce.review_pause_expiry();""")
        gate, expiry, payment = (self.session(name) for name in ('test-gate', 'expiry-worker', 'pay-multiline'))
        gate.send('begin; select pg_advisory_xact_lock(912345);\n\\echo GATED')
        gate.until('GATED')
        expiry.send('select public.commerce_release_expired_reservations();\n\\echo EXPIRED')
        wait_locked(expiry)
        payment.send(apply(attempt) + '\n\\echo PAID')
        wait_locked(payment)
        gate.send('commit;\n\\echo UNGATED')
        gate.until('UNGATED')
        results = '\n'.join(expiry.until('EXPIRED') + payment.until('PAID'))
        print('Expiry/payment concurrency:', results, flush=True)
        self.assertNotIn('deadlock detected', results)
        self.assertNotIn('ERROR:', results)


if __name__ == '__main__':
    unittest.main(argv=['commerce-postgres-review'], verbosity=2)
