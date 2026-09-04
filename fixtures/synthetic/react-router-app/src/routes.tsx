import { Form, Link, NavLink, Navigate, Outlet, createBrowserRouter, redirect, useNavigate, useSearchParams, useState } from "react-router-dom";

const users = [{ id: "alice" }, { id: "bob" }];
export function Layout() { return <><header><NavLink to="/">Home</NavLink><NavLink to="/users">Users</NavLink><NavLink to="/settings">Settings</NavLink></header><Outlet /></>; }
export function Home() { return <Link to="/users/alice">Alice</Link>; }
export function Users() { const [inviteOpen, setInviteOpen] = useState(false); return <><Link to={`/users/${users[0].id}`}>Data user</Link><Link to="/users/alice">Literal user</Link><Link to="/nowhere">Broken</Link><button onClick={() => setInviteOpen(true)}>Invite</button><Dialog id="invite-dialog" open={inviteOpen} /></>; }
export function User() { return <p>User</p>; }
export function Settings() { const [params] = useSearchParams(); const tab = params.get("tab"); const tabs = ["profile", "billing"]; return <><Link to="/settings?tab=billing">Billing</Link>{tabs.includes(tab ?? "profile") && <p>tab</p>}{tab === "billing" && <p>billing</p>}</>; }
export function Checkout() { const navigate = useNavigate(); return <><button onClick={() => navigate("/thanks")}>Pay</button><button onClick={() => navigate(-1)}>Back</button><Form action={async () => redirect("/thanks")} /></>; }
export function Thanks() { return <p>Thanks</p>; }
export function Dialog(_: { id: string; open: boolean }) { return <div />; }
export function Footer() { return <Link to="/users">Footer users</Link>; }
export const router = createBrowserRouter([{ path: "/", element: <Layout />, children: [{ index: true, element: <Home /> }, { path: "users", element: <Users /> }, { path: "users/:id", element: <User /> }, { path: "settings", element: <Settings /> }, { path: "checkout", element: <Checkout /> }, { path: "thanks", element: <Thanks /> }, { path: "old-users", element: <Navigate to="/users" replace /> }, { path: "*", element: <p>NotFound</p> }] }]);
