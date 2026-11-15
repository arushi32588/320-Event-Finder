import { Navigate, Route, Routes } from 'react-router';
import Layout from './components/Layout.jsx';
import { RequireAuth } from './lib/auth.jsx';
import Home from './pages/Home.jsx';
import EventDetails from './pages/EventDetails.jsx';
import Login from './pages/Login.jsx';
import Profile from './pages/Profile.jsx';
import Saved from './pages/Saved.jsx';
import SubmitEvent from './pages/SubmitEvent.jsx';
import CreateAccount from './pages/CreateAccount.jsx';
import OrganizerVerification from './pages/OrganizerVerification.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import Messages from './pages/Messages.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="events" element={<Navigate to="/" replace />} />
        <Route path="events/new" element={<RequireAuth><SubmitEvent /></RequireAuth>} />
        <Route path="events/:id" element={<EventDetails />} />
        <Route path="login" element={<Login />} />
        <Route path="profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="saved" element={<RequireAuth><Saved /></RequireAuth>} />
        <Route path="signup" element={<CreateAccount />} />
        <Route path="organizer/verify" element={<RequireAuth><OrganizerVerification /></RequireAuth>} />
        <Route path="messages" element={<RequireAuth><Messages /></RequireAuth>} />
        <Route path="messages/:conversationId" element={<RequireAuth><Messages /></RequireAuth>} />
        <Route path="admin" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
