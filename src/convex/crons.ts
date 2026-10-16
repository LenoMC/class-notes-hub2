// Si tu as déjà un fichier convex/crons.ts, ajoute juste la ligne crons.interval(...).
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
export default crons;
