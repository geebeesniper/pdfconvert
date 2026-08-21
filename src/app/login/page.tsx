import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";
export default async function LoginPage(){if(await isAdmin())redirect("/projects");return <main className="login-shell"><section className="login-card"><div className="brand-mark">K</div><div><p className="eyebrow">KEY-IN OPERATIONS</p><h1>COA Converter</h1><p className="lead">Convert supplier Certificates of Analysis into your controlled Excel format, organized by project.</p></div><LoginForm/><p className="login-note">Demo authentication is hardcoded server-side. Replace it before public production use.</p></section></main>}
