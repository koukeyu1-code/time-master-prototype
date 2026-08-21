import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import TodayPage from './pages/TodayPage';
import RouteDetailPage from './pages/RouteDetailPage';
import PlacesPage from './pages/PlacesPage';
import TripsPage from './pages/TripsPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TodayPage />} />
        <Route path="route/:legId" element={<RouteDetailPage />} />
        <Route path="places" element={<PlacesPage />} />
        <Route path="trips" element={<TripsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
