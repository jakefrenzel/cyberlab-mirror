import { redirect } from "next/navigation";

// The mirror is the whole app; /repos sends logged-out visitors to log in.
export default function Home() {
  redirect("/repos");
}
