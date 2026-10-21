import { createBrowserRouter } from "react-router-dom"
import AppShell from "@/components/app/app-shell"
import OverviewPage from "@/pages/overview"
import RfqListPage from "@/pages/rfqs"
import RfqDetailPage from "@/pages/rfq-detail"
import ComparePage from "@/pages/compare"
import NotFoundPage from "@/pages/not-found-page"
import AssistantPage from "@/pages/assistant"
import VendorFollowupPage from "@/pages/vendor-followup"
import QuoteExtractionPage from "@/pages/quote-extraction"

// IMPORTANT: Do not remove or modify the code below!
// Normalize basename when hosted in Power Apps
const BASENAME = new URL(".", location.href).pathname
if (location.pathname.endsWith("/index.html")) {
  history.replaceState(null, "", BASENAME + location.search + location.hash);
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "rfqs", element: <RfqListPage /> },
      { path: "rfqs/:id", element: <RfqDetailPage /> },
      { path: "compare", element: <ComparePage /> },
      { path: "assistant", element: <AssistantPage /> },
      { path: "follow-up", element: <VendorFollowupPage /> },
      { path: "quote-extraction", element: <QuoteExtractionPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
], { 
  basename: BASENAME // IMPORTANT: Set basename for proper routing when hosted in Power Apps
})
