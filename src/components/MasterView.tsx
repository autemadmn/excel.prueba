import { useEffect, useMemo, useState } from 'react';
import type { MasterChangeCandidate, MasterProjectValidation, ParsedMasterWorkbook } from '../types/master';
import { assigneeTextMatches, splitAssignees } from '../utils/assignees';
import { formatDateForSpain } from '../utils/dateUtils';
import { normalizeText } from '../utils/normalizeText';
import { getInitials, inferRowHierarchy } from '../utils/plannerData';
import { MasterWorksheetEditor } from './MasterWorksheetEditor';

interface MasterViewProps {
  candidates: MasterChangeCandidate[];
  masterWorkbook: ParsedMasterWorkbook | null;
  validation: MasterProjectValidation;
  plannerFileName: string | null;
  masterFileName: string | null;
  onCreateMaster: () => void;
  canCreateMaster: boolean;
}

type ChangeReviewFilter = 'all' | 'start' | 'end' | 'both' | 'ambiguous' | 'unmatched';

interface ReviewItem {
  candidate: MasterChangeCandidate;
  project: string;
  taskName: string;
  taskNumber: string;
  outlineNumber: string;
  assignee: string;
  duration: string;
  previousStart: string | null;
  currentStart: string | null;
  previousEnd: string | null;
  currentEnd: string | null;
  changedFieldsLabel: string;
  statusLabel: string;
  searchText: string;
}

const changeFilterOptions: Array<{ value: ChangeReviewFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'start', label: 'Inicio modificado' },
  { value: 'end', label: 'Fin modificado' },
  { value: 'both', label: 'Inicio y fin' },
  { value: 'ambiguous', label: 'Coincidencia ambigua' },
  { value: 'unmatched', label: 'Sin coincidencia' },
];

function displayDate(value: string | null): string {
  return formatDateForSpain(value) || '-';
}

function cellByHeader(candidate: MasterChangeCandidate, patterns: string[]): string {
  const normalizedPatterns = patterns.map(normalizeText);
  const cell = candidate.comparedRow.currentRow.cells.find((currentCell) => {
    const header = normalizeText(currentCell.header);
    return normalizedPatterns.some((pattern) => header.includes(pattern));
  });

  return cell?.displayValue?.trim() ?? '';
}

function changeValue(candidate: MasterChangeCandidate, field: 'startDate' | 'endDate', side: 'previous' | 'current') {
  return candidate.changes.find((change) => change.field === field)?.[side] ?? null;
}

function fallbackCurrentDate(candidate: MasterChangeCandidate, field: 'startDate' | 'endDate'): string | null {
  return field === 'startDate'
    ? candidate.comparedRow.currentRow.startDate
    : candidate.comparedRow.currentRow.endDate;
}

function changedFieldsLabel(candidate: MasterChangeCandidate): string {
  const fields = new Set(candidate.changes.map((change) => change.field));
  if (fields.has('startDate') && fields.has('endDate')) {
    return 'Inicio y Fin';
  }

  if (fields.has('startDate')) {
    return 'Inicio';
  }

  if (fields.has('endDate')) {
    return 'Fin';
  }

  return '-';
}

function statusLabel(candidate: MasterChangeCandidate): string {
  if (candidate.status === 'ready') {
    return 'Fecha modificada';
  }

  if (candidate.status === 'ambiguous') {
    return 'Coincidencia ambigua';
  }

  if (candidate.status === 'not_found') {
    return 'Sin coincidencia en maestro';
  }

  if (candidate.status === 'blocked' || candidate.status === 'project_blocked') {
    return 'Bloqueada';
  }

  return 'Sin cambios';
}

function shouldShowInReview(candidate: MasterChangeCandidate): boolean {
  return candidate.changes.length > 0 || candidate.status === 'ambiguous' || candidate.status === 'not_found';
}

function buildReviewItems(candidates: MasterChangeCandidate[]): ReviewItem[] {
  const rows = candidates.map((candidate) => candidate.comparedRow);
  const contexts = inferRowHierarchy(rows);

  return candidates.filter(shouldShowInReview).map((candidate) => {
    const row = candidate.comparedRow.currentRow;
    const context = contexts.get(candidate.comparedRow);
    const project = context?.project && context.project !== 'Sin proyecto'
      ? context.project
      : candidate.projectName || 'Sin proyecto';
    const taskName = row.taskName.trim() || 'Sin nombre';
    const assignee = row.assignee.trim() || candidate.masterRow?.assignee || 'Sin asignar';
    const duration = cellByHeader(candidate, ['duracion', 'duration']);
    const taskNumber = cellByHeader(candidate, ['numero de tarea', 'n tarea', 'task number', 'id']);
    const outlineNumber = cellByHeader(candidate, ['numero de esquema', 'esquema', 'outline']);
    const previousStart = changeValue(candidate, 'startDate', 'previous');
    const currentStart = changeValue(candidate, 'startDate', 'current') ?? fallbackCurrentDate(candidate, 'startDate');
    const previousEnd = changeValue(candidate, 'endDate', 'previous');
    const currentEnd = changeValue(candidate, 'endDate', 'current') ?? fallbackCurrentDate(candidate, 'endDate');
    const fieldsLabel = changedFieldsLabel(candidate);
    const candidateStatusLabel = statusLabel(candidate);
    const searchText = normalizeText(
      [
        taskName,
        taskNumber,
        outlineNumber,
        project,
        assignee,
        duration,
        fieldsLabel,
        candidateStatusLabel,
        candidate.observation,
        ...candidate.changes.flatMap((change) => [change.previous, change.current, change.label]),
      ].join(' '),
    );

    return {
      candidate,
      project,
      taskName,
      taskNumber,
      outlineNumber,
      assignee,
      duration,
      previousStart,
      currentStart,
      previousEnd,
      currentEnd,
      changedFieldsLabel: fieldsLabel,
      statusLabel: candidateStatusLabel,
      searchText,
    };
  });
}

function matchesChangeFilter(item: ReviewItem, filter: ChangeReviewFilter): boolean {
  const fields = new Set(item.candidate.changes.map((change) => change.field));

  if (filter === 'all') {
    return true;
  }

  if (filter === 'start') {
    return fields.has('startDate') && !fields.has('endDate');
  }

  if (filter === 'end') {
    return fields.has('endDate') && !fields.has('startDate');
  }

  if (filter === 'both') {
    return fields.has('startDate') && fields.has('endDate');
  }

  if (filter === 'ambiguous') {
    return item.candidate.status === 'ambiguous';
  }

  return item.candidate.status === 'not_found';
}

function uniqueOptions(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, 'es'));
}

export function MasterView({
  candidates,
  masterWorkbook,
  validation,
  plannerFileName,
  masterFileName,
  onCreateMaster,
  canCreateMaster,
}: MasterViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [changeFilter, setChangeFilter] = useState<ChangeReviewFilter>('all');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [autoDateFilterRequest, setAutoDateFilterRequest] = useState(0);

  const reviewItems = useMemo(() => buildReviewItems(candidates), [candidates]);
  const projectOptions = useMemo(() => uniqueOptions(reviewItems.map((item) => item.project)), [reviewItems]);
  const assigneeOptions = useMemo(
    () =>
      uniqueOptions(
        reviewItems.flatMap((item) => splitAssignees(item.assignee).map((person) => person.label)),
      ),
    [reviewItems],
  );
  const normalizedSearch = normalizeText(searchTerm);
  const filteredItems = reviewItems.filter((item) => {
    const matchesSearch = !normalizedSearch || item.searchText.includes(normalizedSearch);
    const matchesProject = projectFilter === 'all' || item.project === projectFilter;
    const matchesAssignee =
      assigneeFilter === 'all' || assigneeTextMatches(item.assignee, new Set([normalizeText(assigneeFilter)]));
    const matchesChange = matchesChangeFilter(item, changeFilter);

    return matchesSearch && matchesProject && matchesAssignee && matchesChange;
  });

  useEffect(() => {
    if (filteredItems.length === 0) {
      setSelectedCandidateId(null);
      return;
    }

    if (!selectedCandidateId || !filteredItems.some((item) => item.candidate.id === selectedCandidateId)) {
      setSelectedCandidateId(filteredItems[0].candidate.id);
    }
  }, [filteredItems, selectedCandidateId]);

  const selectedItem =
    filteredItems.find((item) => item.candidate.id === selectedCandidateId) ??
    reviewItems.find((item) => item.candidate.id === selectedCandidateId) ??
    null;
  const selectedCandidate = selectedItem?.candidate ?? null;
  const previousDates = selectedCandidate?.changes
    .map((change) => change.previous)
    .filter((date): date is string => Boolean(date)) ?? [];

  const clearChangeFilters = (): void => {
    setSearchTerm('');
    setProjectFilter('all');
    setAssigneeFilter('all');
    setChangeFilter('all');
  };

  return (
    <section className="master-view" aria-label="Excel maestro">
      <div className={`master-validation ${validation.status === 'valid' ? 'is-valid' : 'is-blocked'}`}>
        <div>
          <p className="planner-kicker">Validación del maestro</p>
          <h2>{validation.status === 'valid' ? 'Proyecto validado' : 'Proyecto pendiente de validar'}</h2>
          <span>{validation.message}</span>
          <span>
            Planner: {plannerFileName ?? 'No cargado'} · Maestro: {masterFileName ?? 'No cargado'}
          </span>
        </div>
        <button className="primary-button" type="button" disabled={!canCreateMaster} onClick={onCreateMaster}>
          Crea Excel Maestro Actualizado
        </button>
      </div>

      <div className="master-workspace">
        <section className="master-changes-panel" aria-label="Cambios detectados en Planner">
          <div className="master-section-heading">
            <div>
              <p className="planner-kicker">Revisión manual</p>
              <h2>Cambios detectados en Planner</h2>
            </div>
            <div className="master-sheet-meta">
              <span>{filteredItems.length} visibles</span>
              <span>{reviewItems.length} para revisar</span>
            </div>
          </div>

          <div className="master-change-toolbar">
            <label className="grid-search">
              <span>Buscar</span>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.currentTarget.value)}
                placeholder="Buscar por nombre, proyecto, responsable o fecha"
              />
            </label>
            <label>
              <span>Proyecto</span>
              <select value={projectFilter} onChange={(event) => setProjectFilter(event.currentTarget.value)}>
                <option value="all">Todos</option>
                {projectOptions.map((project) => (
                  <option key={project} value={project}>
                    {project}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Asignado a</span>
              <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.currentTarget.value)}>
                <option value="all">Todos</option>
                {assigneeOptions.map((assignee) => (
                  <option key={assignee} value={assignee}>
                    {assignee}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Tipo de cambio</span>
              <select
                value={changeFilter}
                onChange={(event) => setChangeFilter(event.currentTarget.value as ChangeReviewFilter)}
              >
                {changeFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary-button grid-clear-button" type="button" onClick={clearChangeFilters}>
              Limpiar filtros
            </button>
          </div>

          <div className="master-change-table-shell">
            <table className="master-change-table">
              <thead>
                <tr>
                  <th>Tarea</th>
                  <th>Nº tarea</th>
                  <th>Nº esquema</th>
                  <th>Proyecto</th>
                  <th>Asignado a</th>
                  <th>Duración</th>
                  <th>Inicio anterior</th>
                  <th>Inicio actual</th>
                  <th>Fin anterior</th>
                  <th>Fin actual</th>
                  <th>Campos</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="grid-empty-row">
                      No hay cambios para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr
                      key={item.candidate.id}
                      className={selectedCandidateId === item.candidate.id ? 'is-selected' : undefined}
                      onClick={() => setSelectedCandidateId(item.candidate.id)}
                    >
                      <td className="master-task-cell">{item.taskName}</td>
                      <td>{item.taskNumber || '-'}</td>
                      <td>{item.outlineNumber || '-'}</td>
                      <td>{item.project}</td>
                      <td>
                        <span className="grid-assignee">
                          <span className="grid-avatar" aria-hidden="true">
                            {getInitials(item.assignee)}
                          </span>
                          {item.assignee}
                        </span>
                      </td>
                      <td>{item.duration || '-'}</td>
                      <td>{displayDate(item.previousStart)}</td>
                      <td>{displayDate(item.currentStart)}</td>
                      <td>{displayDate(item.previousEnd)}</td>
                      <td>{displayDate(item.currentEnd)}</td>
                      <td>{item.changedFieldsLabel}</td>
                      <td>{item.statusLabel}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="master-selected-change">
            {selectedItem ? (
              <>
                <div>
                  <p className="planner-kicker">Cambio seleccionado</p>
                  <h3>{selectedItem.taskName}</h3>
                  <dl>
                    <div>
                      <dt>Inicio anterior</dt>
                      <dd>{displayDate(selectedItem.previousStart)}</dd>
                    </div>
                    <div>
                      <dt>Inicio nuevo</dt>
                      <dd>{displayDate(selectedItem.currentStart)}</dd>
                    </div>
                    <div>
                      <dt>Fin anterior</dt>
                      <dd>{displayDate(selectedItem.previousEnd)}</dd>
                    </div>
                    <div>
                      <dt>Fin nuevo</dt>
                      <dd>{displayDate(selectedItem.currentEnd)}</dd>
                    </div>
                    <div>
                      <dt>Campos modificados</dt>
                      <dd>{selectedItem.changedFieldsLabel}</dd>
                    </div>
                  </dl>
                </div>
                <button
                  className="primary-button"
                  type="button"
                  disabled={previousDates.length === 0}
                  onClick={() => setAutoDateFilterRequest((request) => request + 1)}
                >
                  Buscar coincidencias en Seguimiento Proyectos
                </button>
              </>
            ) : (
              <p>Selecciona una fila modificada para ver el resumen del cambio.</p>
            )}
          </div>
        </section>

        <MasterWorksheetEditor
          masterWorkbook={masterWorkbook}
          selectedCandidate={selectedCandidate}
          autoDateFilterRequest={autoDateFilterRequest}
        />
      </div>
    </section>
  );
}
