import { Demo } from "@/components/demo";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Meadow · movie.watched</h1>
      <p className="mt-2 mb-10 text-zinc-600 dark:text-zinc-400">
        Send the event and watch an Inngest function fetch the plot from OMDb and email it with Resend.
      </p>
      <Demo />
    </main>
  );
}
