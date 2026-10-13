import { Route, Routes } from 'react-router';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Events from './pages/Events.jsx';
import EventDetails from './pages/EventDetails.jsx';
import Login from './pages/Login.jsx';
import Profile from './pages/Profile.jsx';
import CreateAccount from './pages/CreateAccount.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="events" element={<Events />} />
        <Route path="events/:id" element={<EventDetails />} />
        <Route path="login" element={<Login />} />
        <Route path="profile" element={<Profile />} />
        <Route path="signup" element={<CreateAccount />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
