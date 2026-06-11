import { useMemo, useState } from 'react';
import type { FilterOption } from '../types/comparison';
import type { MasterChangeCandidate, MasterProjectValidation } from '../types/master';
import { assigneeTextMatches, splitAssignees } from '../utils/assignees';
import { normalizeText } from '../utils/normalizeText';
import { getRowProject, initialPlanningFilters } from '../utils/planningFilters';
import type { PlanningChangeFilter } from '../utils/planningFilters';
import { inferRowHierarchy } from '../utils/plannerData';
import { PlanningFiltersBar } from './PlanningFiltersBar';

interface MasterViewProps {
  candidates: MasterChangeCandidate[];
  validation: MasterProjectValidation;
  plannerFileName: string | null;
  masterFileName: string | null;
  onCreateMaster: () => void;
  canCreateMaster: boolean;
}

function countStatus(candidates: MasterChangeCandidate[], predicate: (candidate: MasterChangeCandidate) => boolean) {
  return candidates.filter(predicate).length;
}

function optionsFromLabels(labels: string[]): FilterOption[] {
  return Array.from(new Set(labels.filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, 'es'))
    .map((label) => ({
      value: label,
      label,
      normalized: normalizeText(label),
    }));
}

function matchesChangeFilter(candidate: MasterChangeCandidate, filter: PlanningChangeFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'changed') {
    return candidate.changes.length > 0;
  }

  if (filter === 'unchanged') {
    return candidate.status === 'no_change';
  }

  if (filter === 'unmatched') {
    return candidate.status === 'not_found';
  }

  if (filter === 'blocked') {
    return candidate.status === 'blocked' || candidate.status === 'project_blocked';
  }

  return candidate.status === 'ambiguous';
}

export function MasterView({
  candidates,
  validation,
  plannerFileName,
  masterFileName,
  onCreateMaster,
  canCreateMaster,
}: MasterViewProps) {
  const [filters, setFilters] = useState(initialPlanningFilters);
  const rows = useMemo(() => candidates.map((candidate) => candidate.comparedRow), [candidates]);
  const contexts = useMemo(() => inferRowHierarchy(rows), [rows]);

  const items = useMemo(
    () =>
      candidates.map((candidate) => {
        const row = candidate.comparedRow;
        const project = getRowProject(row, contexts) || candidate.projectName || 'Sin proyecto';
        const assignee = row.currentRow.assignee.trim() || candidate.masterRow?.assignee || 'Sin asignar';
        const observations = candidate.masterRow?.observations || candidate.observation;
        const searchText = normalizeText(
          [
            row.currentRow.taskName,
            project,
            assignee,
            candidate.status,
            candidate.validation.message,
            observations,
            ...candidate.changes.flatMap((change) => [change.label, change.previous, change.current]),
          ].join(' '),
        );

        return { candidate, project, assignee, searchText };
      }),
    [candidates, contexts],
  );
  const projectOptions = useMemo(() => optionsFromLabels(items.map((item) => item.project)), [items]);
  const assigneeOptions = useMemo(
    () =>
      optionsFromLabels(
        items.flatMap((item) => splitAssignees(item.assignee).map((person) => person.label)),
      ),
    [items],
  );
  const normalizedSearch = normalizeText(filters.searchTerm);
  const filteredCandidates = items
    .filter((item) => {
      const matchesSearch = !normalizedSearch || item.searchText.includes(normalizedSearch);
      const matchesProject = filters.project === 'all' || item.project === filters.project;
      const matchesAssignee =
        filters.assignee === 'all' || assigneeTextMatches(item.assignee, new Set([normalizeText(filters.assignee)]));
      const matchesChange = matchesChangeFilter(item.candidate, filters.change);

      return matchesSearch && matchesProject && matchesAssignee && matchesChange;
    })
    .map((item) => item.candidate);

  const readyCount = countStatus(filteredCandidates, (candidate) => candidate.status === 'ready');
  const noChangeCount = countStatus(filteredCandidates, (candidate) => candidate.status === 'no_change');
  const unmatchedCount = countStatus(filteredCandidates, (candidate) => candidate.status === 'not_found');
  const blockedCount = countStatus(filteredCandidates, (candidate) =>
    ['blocked', 'ambiguous', 'project_blocked'].includes(candidate.status),
  );

  return (
    <section className="master-view" aria-label="Excel maestro">
      <div className={`master-validation ${validation.status === 'valid' ? 'is-valid' : 'is-blocked'}`}>
        <div>
          <p className="planner-kicker">Validación del maestro</p>
          <h2>{validation.status === 'valid' ? 'Proyecto validado' : 'Proyecto pendiente de validar'}</h2>
          <span>{validation.message}</span>
        </div>
        <button className="primary-button" type="button" disabled={!canCreateMaster} onClick={onCreateMaster}>
          Crea Excel Maestro Actualizado
        </button>
      </div>

      <PlanningFiltersBar
        filters={filters}
        projectOptions={projectOptions}
        assigneeOptions={assigneeOptions}
        onFiltersChange={setFilters}
        onClearFilters={() => setFilters(initialPlanningFilters)}
      />

      <div className="master-card-grid">
        <article>
          <span>Planner actual</span>
          <strong>{plannerFileName ?? 'No cargado'}</strong>
        </article>
        <article>
          <span>Excel maestro</span>
          <strong>{masterFileName ?? 'No cargado'}</strong>
        </article>
        <article>
          <span>Cambios listos</span>
          <strong>{readyCount}</strong>
        </article>
        <article>
          <span>Sin cambios</span>
          <strong>{noChangeCount}</strong>
        </article>
        <article>
          <span>Sin coincidencia en maestro</span>
          <strong>{unmatchedCount}</strong>
        </article>
        <article>
          <span>Bloqueadas o ambiguas</span>
          <strong>{blockedCount}</strong>
        </article>
      </div>
    </section>
  );
}
