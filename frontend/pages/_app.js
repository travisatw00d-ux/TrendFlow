import "@/styles/globals.css";

export default function App({ Component, pageProps }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Component {...pageProps} />
    </div>
  );
}
