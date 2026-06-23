export function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-white">
      <div className="container-x flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-8 text-sm text-muted">
        <p>&copy; {new Date().getFullYear()} TriStateTags. Email delivery only.</p>
        <p className="text-xs">
          Powered by{" "}
          <a
            href="https://paystack.com"
            className="font-semibold text-primary hover:text-primary-dark"
            target="_blank"
            rel="noreferrer noopener"
          >
            Paystack
          </a>
        </p>
      </div>
    </footer>
  );
}
