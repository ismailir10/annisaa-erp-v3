import { redirect } from "next/navigation";

/**
 * `/teacher/sessions` used to be a 404: sessions were only reachable from the
 * "Sesi & penjemputan" list on the teacher home, and nothing linked here, so a
 * teacher who typed or bookmarked the parent path hit a dead end (TCH-13). The
 * list already lives on the home page — send them there, to that section.
 */
export default function TeacherSessionsIndex() {
  redirect("/teacher#pickup-sessions");
}
