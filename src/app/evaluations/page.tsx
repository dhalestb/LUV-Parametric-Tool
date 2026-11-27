import ArchitecturalEvaluations from "@/components/evaluations-v50e47fa/ArchitecturalEvaluations";
import {EvaluationsSourceProvider} from "@/components/evaluations-v50e47fa/evaluationSource";

/** Five visible descriptors; source controls and results belong to Evaluations. */
export default function EvaluationsPage() {
  return <EvaluationsSourceProvider><ArchitecturalEvaluations /></EvaluationsSourceProvider>;
}
