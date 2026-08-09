import { listUpcomingEvents } from "@/lib/actions/calendar";
import { CalendarPanel } from "@/components/calendar/calendar-panel";

export default async function CalendarPage() {
  const events = await listUpcomingEvents();
  return <CalendarPanel events={events} />;
}
