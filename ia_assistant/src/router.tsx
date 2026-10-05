import { createBrowserRouter } from "react-router-dom";
import RootLayout from "./layouts/RootLayout";
import AssisantPage from "./pages/assisant/AssisantPage";
import KpisPage from "./pages/kpis/KpisPage";


export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <AssisantPage /> },
      { path: "kpis", element: <KpisPage /> },
    ],
  },
]);