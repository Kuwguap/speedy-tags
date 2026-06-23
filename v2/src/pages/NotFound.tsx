import { Link } from "react-router-dom";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-cream">
      <Header />
      <main className="flex-1 container-x py-24 text-center">
        <p className="pill mx-auto">404</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold text-navy">Page not found</h1>
        <p className="mt-2 text-muted">That URL doesn&rsquo;t exist. Try the home page.</p>
        <Link to="/" className="btn-gold mt-6 inline-flex">
          Go home
        </Link>
      </main>
      <Footer />
    </div>
  );
}
