"""Task 05 planner/alert checks using real PostgreSQL connections and no Python packages.
Run with a disposable PG16 Docker container:
  python tests/commerce-worker-plan-review.py --container commerce-review05-pg16
"""
import argparse
import json
import pathlib
import runpy
import sys
import unittest
from collections import Counter

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--container', default='commerce-review05-pg16')
args = parser.parse_args()
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.argv = ['worker-plan-helpers', '--container', args.container]
helpers = runpy.run_path(str(ROOT / 'tests/commerce-postgres-review.py'), run_name='worker_plan_helpers')
sql, DB = helpers['sql'], helpers['DB']
fixture, Session, wait_locked = (helpers[name] for name in ('fixture', 'Session', 'wait_locked'))


class WorkerPlanReview(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sql("do $$ begin " + ''.join(
            f"if not exists(select 1 from pg_roles where rolname='{role}') then create role {role}; end if; "
            for role in ('anon', 'authenticated', 'service_role')) + "end $$;", db='postgres')

    def setUp(self):
        sql(f'create database {DB};', db='postgres')
        self.addCleanup(lambda: sql(f'drop database {DB} with (force);', db='postgres'))
        sql('alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;')
        sql((ROOT / 'supabase/001_commerce_core.sql').read_text())

    def session(self, name):
        session = Session(name)
        self.addCleanup(session.close)
        return session

    def plan(self):
        return json.loads(sql('select public.commerce_worker_plan();'))

    def due_payment(self, slug):
        order, attempt, _ = fixture(slug)
        sql("update commerce.payment_attempts set created_at=clock_timestamp()-interval '10 minutes' "
            f"where reference='{attempt['reference']}';")
        return order, attempt

    def test_idle_and_single_queue_plans(self):
        self.assertEqual(self.plan(), dict(alerts_due=False, payments_due=False, first=None))
        order, attempt = self.due_payment('plan-single')
        self.assertEqual(self.plan(), dict(alerts_due=False, payments_due=True, first='payments'))
        sql(f"update commerce.payment_attempts set status='cancelled' where reference='{attempt['reference']}'; "
            "insert into commerce.jobs(store_id,kind,dedup_key) select store_id,'notify_owner_paid_order',"
            f"'single-alert' from commerce.orders where id='{order['order_id']}';")
        self.assertEqual(self.plan(), dict(alerts_due=True, payments_due=False, first='alerts'))
        print('Planner idle/payment-only/alert-only: pass', flush=True)

    def test_six_blocked_concurrent_plans_alternate_atomically(self):
        order, _ = self.due_payment('plan-concurrent')
        sql("insert into commerce.jobs(store_id,kind,dedup_key) select store_id,'notify_owner_paid_order',"
            f"'concurrent-alert' from commerce.orders where id='{order['order_id']}';")
        gate = self.session('plan-gate')
        gate.send('begin; select id from commerce.worker_state for update;\n\\echo GATED')
        self.assertEqual(gate.until('GATED'), ['1'])
        workers = [self.session(f'plan-concurrent-{n}') for n in range(6)]
        for worker in workers:
            worker.send('begin; select public.commerce_worker_plan(); commit;\n\\echo PLANNED')
        for worker in workers:
            wait_locked(worker)  # Each has reached the locked worker_state update.
        gate.send('commit;\n\\echo OPEN')
        gate.until('OPEN')
        plans = [json.loads(worker.until('PLANNED')[0]) for worker in workers]
        self.assertTrue(all(plan['alerts_due'] and plan['payments_due'] for plan in plans))
        self.assertEqual(Counter(plan['first'] for plan in plans), Counter(alerts=3, payments=3))
        following = self.plan()
        self.assertIn(following['first'], ('alerts', 'payments'))
        print('Six concurrent planners:', dict(Counter(plan['first'] for plan in plans)), flush=True)

    def test_oldest_due_alert_beats_recent_lower_id(self):
        order, _, _ = fixture('plan-oldest')
        low = int(sql("insert into commerce.jobs(store_id,kind,dedup_key,run_after) "
                      "select store_id,'notify_owner_paid_order','recent-low',clock_timestamp()-interval '1 minute' "
                      f"from commerce.orders where id='{order['order_id']}' returning id;"))
        high = int(sql("insert into commerce.jobs(store_id,kind,dedup_key,run_after) "
                       "select store_id,'notify_owner_paid_order','old-high',clock_timestamp()-interval '10 minutes' "
                       f"from commerce.orders where id='{order['order_id']}' returning id;"))
        self.assertLess(low, high)
        first = json.loads(sql('select row_to_json(j) from public.commerce_claim_jobs(1) j;'))
        second = json.loads(sql('select row_to_json(j) from public.commerce_claim_jobs(1) j;'))
        self.assertEqual(first['id'], high)
        self.assertEqual(second['id'], low)
        print(f'Oldest-due job {high} claimed before recent lower-ID job {low}: pass', flush=True)


if __name__ == '__main__':
    unittest.main(argv=['commerce-worker-plan-review'], verbosity=2)
