import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { sendMoviePlot } from "@/inngest/functions/movie-watched";

export const { GET, POST, PUT } = serve({ client: inngest, functions: [sendMoviePlot] });
