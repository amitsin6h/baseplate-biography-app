import { redirect } from 'next/navigation'

// The only feature in this standalone project is the Biography screen.
// Redirect the root route there so http://localhost:3000/ works as expected.
export default function RootPage() {
  redirect('/biography')
}
