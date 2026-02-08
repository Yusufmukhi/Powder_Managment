import { SessionProvider } from "../context/session.context"
import Router from "./router"

export default function App() {
  return (
    <SessionProvider>
      <Router />
    </SessionProvider>
  )
}
