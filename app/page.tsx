import { redirect } from "next/navigation";

// The app itself doesn't exist yet; the mascot demo is the only page for now.
export default function Home() {
  redirect("/mascot-demo");
}
