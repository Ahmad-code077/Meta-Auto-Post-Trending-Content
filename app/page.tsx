import { ThemeToggler } from "@/components/theme/ThemeToggler";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-accent  p-4">
      <h1 className="text-3xl font-bold mb-4">Welcome to the Home Page</h1>
      <ThemeToggler />
    </div>
  );
}
