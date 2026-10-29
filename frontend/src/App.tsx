import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import BusinessPage from "./pages/BusinessPage";
import CrmPage from "./pages/CrmPage";
import DashboardPage from "./pages/DashboardPage";
import CoverageTab from "./pages/CoveragePage";
import DiscoverLayout, { BrowseTab, FavoritesTab, FindTab } from "./pages/DiscoverPage";
import LeadListPage from "./pages/LeadListPage";
import LeadPage from "./pages/LeadPage";
import ReviewQueuePage from "./pages/ReviewQueuePage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="discover" element={<DiscoverLayout />}>
          <Route index element={<BrowseTab />} />
          <Route path="find" element={<FindTab />} />
          <Route path="favorites" element={<FavoritesTab />} />
          <Route path="coverage" element={<CoverageTab />} />
        </Route>
        <Route path="review" element={<ReviewQueuePage />} />
        <Route path="business/:id" element={<BusinessPage />} />
        <Route path="leads" element={<LeadListPage />} />
        <Route path="leads/:id" element={<LeadPage />} />
        <Route path="crm" element={<CrmPage />} />
        <Route path="settings" element={<SettingsPage />} />
        {/* Old routes kept working */}
        <Route path="discovery" element={<Navigate to="/discover/find" replace />} />
        <Route path="favorites" element={<Navigate to="/discover/favorites" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
