// /cron — scheduled jobs across the fleet. Placeholder; the orchestrator
// will get a schedule primitive in M6 that persists cron specs into
// resources + kicks off a run at the trigger time.

import { CalendarClock } from 'lucide-react'
import { InfraShell } from './_shared'

export default function CronScreen() {
  return (
    <InfraShell
      title="Cron"
      subtitle="Scheduled jobs — run goals on a cadence, not on demand."
      kind={null}
      icon={<CalendarClock size={20} />}
      emptyHint={
        <>
          Landing in M6. Meanwhile, describe a recurring task in Chat:
          <br />
          <code className="bg-white/5 rounded px-1 font-mono">every Monday 9am: snapshot the production db</code>
        </>
      }
    />
  )
}
