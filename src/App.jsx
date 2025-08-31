import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
  Navigate,
} from "react-router-dom";
//import { BrowserRouter as Router, Routes, Route, useLocation} from 'react-router-dom';
import Navbar from "./components/navbar";
import AdminDashboard from "./pages/Admin";
import AdminProfile from "./pages/AdminProfile";
import Search from "./pages/searchScholar";
import MatchScholar from "./pages/matchScholar";
import DataForm from "./pages/dataform";
import DataForm2 from "./pages/dataform2";
import Home from "./pages/Home";
import "./App.css";
import AuthPage from "./pages/AuthPage";
import UniSearch from "./pages/UniSearch";
import DataFormuni from "./pages/dataformUni";
import DataFormuni2 from "./pages/dataformUni2";
import MatchUni from "./pages/matchUni";
import CostPredict from "./pages/CostPredict";
import ScholarAnalysis from "./pages/scholar_analysis";
import UniAnalysis from "./pages/uni_analysis";

function AppContent() {
  const location = useLocation();
  const hideNavbar = /^\/(authpage|admin)(\/|$)/.test(location.pathname);

  return (
    <>
      {!hideNavbar && <Navbar />}
      <div className="p-4">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/match-scholar" element={<MatchScholar />} />
          <Route path="/match-uni" element={<MatchUni />} />
          <Route path="/data-form" element={<DataForm />} />
          <Route path="/next-page" element={<DataForm2 />} />
          <Route path="/search" element={<Search />} />
          <Route path="/search-university" element={<UniSearch />} />
          <Route path="/data-form-uni" element={<DataFormuni />} />
          <Route path="/data-form-uni2" element={<DataFormuni2 />} />
          <Route path="/authpage" element={<AuthPage />} />
          <Route path="/cost-prediction" element={<CostPredict />} />
          <Route path="/analysis/scholarships" element={<ScholarAnalysis />} />
          <Route path="/uni-analysis" element={<UniAnalysis />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/profile" element={<AdminProfile />} />

          <Route
            path="/analysis"
            element={<Navigate to="/analysis/scholarships" replace />}
          />
        </Routes>
      </div>
    </>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
