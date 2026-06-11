import { useMemo, useState } from 'react';
import type { ComparedRow, FilterOption } from '../types/comparison';
import { assigneeTextMatches, splitAssignees } from '../utils/assignees';
import { formatDateForSpain } from '../utils/dateUtils';
import type { PlanningChangeFilter } from '../utils/planningFilters';
import { initialPlanningFilters, matchesPlanningChangeFilter } from '../utils/planningFilters';
import {
  getDueDate,
  getInitials,
  getPreviousDueDate,
  inferRowHierarchy,
  isStructuralRow,
} from '../utils/plannerData';
import { normalizeText } from '../utils/normalizeText';
import { EventDetailModal } from './EventDetailModal';
import { PlanningFiltersBar } from './PlanningFiltersBar';

interface PlannerViewProps {
  rows: ComparedRow[];
}

type DueTone = 'late' | 'early' | 'normal';

interface PlannerLabel {
  text: string;
  tone: 'blue' | 'yellow' | 'gray' | 'red' | 'green' | 'purple';
}

interface PlannerItem {
  id: string;
  title: string;
  description?: string;
  assignee: string;
  project: string;
  bucket: string;
  dueDate: string | null;
  dueTone: DueTone;
  labels: PlannerLabel[];
  checklist?: string;
  infoCount?: number;
  searchText?: string;
  row?: ComparedRow;
}

const demoItems: PlannerItem[] = [
  {
    id: 'demo-1',
    title: 'Entrega plano unifilar definitivo',
    description: 'Documento pendiente para revision tecnica.',
    assignee: 'Ana Lopez',
    project: 'Proyecto Demo Norte',
    bucket: 'Planificacion',
    dueDate: '2026-06-17',
    dueTone: 'late',
    labels: [
      { text: 'Ingenieria', tone: 'blue' },
      { text: 'Retrasado', tone: 'red' },
    ],
    checklist: '1 / 3',
    infoCount: 2,
  },
  {
    id: 'demo-2',
    title: 'Recepcion documentacion inversores',
    assignee: 'Bruno Martin',
    project: 'Proyecto Demo Norte',
    bucket: 'Ingenieria y documentacion',
    dueDate: '2026-06-20',
    dueTone: 'normal',
    labels: [{ text: 'Documentacion', tone: 'gray' }],
    checklist: '2 / 4',
  },
  {
    id: 'demo-3',
    title: 'Aprobacion memoria tecnica',
    description: 'Fecha adelantada respecto a la planificación del maestro.',
    assignee: 'Carla Ruiz',
    project: 'Proyecto Demo Sur',
    bucket: 'Revision y aprobacion',
    dueDate: '2026-06-12',
    dueTone: 'early',
    labels: [
      { text: 'Requiere aprobacion', tone: 'yellow' },
      { text: 'Adelantado', tone: 'green' },
    ],
    infoCount: 1,
  },
  {
    id: 'demo-4',
    title: 'Recepcion de modulos fotovoltaicos',
    assignee: 'David Perez',
    project: 'Proyecto Demo Sur',
    bucket: 'Compras y suministro',
    dueDate: '2026-06-24',
    dueTone: 'late',
    labels: [
      { text: 'Compras', tone: 'yellow' },
      { text: 'Retrasado', tone: 'red' },
    ],
    checklist: '0 / 2',
  },
  {
    id: 'demo-5',
    title: 'Acta de recepcion de obra',
    assignee: 'Elena Santos',
    project: 'Proyecto Demo Este',
    bucket: 'Ejecucion y recepcion',
    dueDate: '2026-06-28',
    dueTone: 'normal',
    labels: [{ text: 'Nuevo', tone: 'purple' }],
    infoCount: 3,
  },
  {
    id: 'demo-6',
    title: 'Revision listado de materiales',
    assignee: 'Ana Lopez',
    project: 'Proyecto Demo Norte',
    bucket: 'Compras y suministro',
    dueDate: '2026-06-14',
    dueTone: 'early',
    labels: [{ text: 'Adelantado', tone: 'green' }],
    checklist: '3 / 3',
  },
];

const demoColumnOrder = [
  'Planificacion',
  'Ingenieria y documentacion',
  'Revision y aprobacion',
  'Compras y suministro',
  'Ejecucion y recepcion',
];

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, 'es'),
  );
}

function optionsFromLabels(labels: string[]): FilterOption[] {
  return labels.map((label) => ({
    value: label,
    label,
    normalized: normalizeText(label),
  }));
}

function formatCompactDate(value: string | null): string {
  if (!value) {
    return 'Sin fecha';
  }

  return formatDateForSpain(value).slice(0, 5);
}

function resolveDueTone(row: ComparedRow): DueTone {
  const currentDue = getDueDate(row);
  const previousDue = getPreviousDueDate(row);

  if (!currentDue || !previousDue || currentDue === previousDue) {
    return 'normal';
  }

  return currentDue > previousDue ? 'late' : 'early';
}

function labelsForRow(row: ComparedRow, dueTone: DueTone): PlannerLabel[] {
  const labels: PlannerLabel[] = [];

  if (dueTone === 'late') {
    labels.push({ text: 'Retrasado', tone: 'red' });
  } else if (dueTone === 'early') {
    labels.push({ text: 'Adelantado', tone: 'green' });
  } else if (row.changedFields.length > 0) {
    labels.push({ text: 'Fecha modificada', tone: 'yellow' });
  }

  if (row.status === 'unmatched') {
    labels.push({ text: 'Nuevo', tone: 'purple' });
  }

  if (row.isAmbiguous) {
    labels.push({ text: 'Coincidencia ambigua', tone: 'gray' });
  }

  return labels.slice(0, 2);
}

function descriptionForRow(row: ComparedRow, dueTone: DueTone): string | undefined {
  if (dueTone === 'late') {
    return 'Fecha de vencimiento desplazada más tarde respecto al Excel maestro.';
  }

  if (dueTone === 'early') {
    return 'Fecha de vencimiento adelantada respecto al Excel maestro.';
  }

  if (row.changedFields.length > 0) {
    return 'Fecha modificada respecto al Excel maestro.';
  }

  if (row.status === 'unmatched') {
    return 'Sin coincidencia clara en el Excel maestro.';
  }

  return undefined;
}

function itemsFromRows(rows: ComparedRow[]): PlannerItem[] {
  const contexts = inferRowHierarchy(rows);

  return rows.flatMap((row, index) => {
    const title = row.currentRow.taskName.trim();
    if (!title || isStructuralRow(row)) {
      return [];
    }

    const dueDate = getDueDate(row);
    const assignee = row.currentRow.assignee.trim() || 'Sin asignar';
    const context = contexts.get(row);
    const dueTone = resolveDueTone(row);

    return [
      {
        id: `row-${row.currentRow.excelRowNumber}-${index}`,
        title,
        description: descriptionForRow(row, dueTone),
        assignee,
        project: context?.project ?? 'Sin proyecto',
        bucket: context?.bucket ?? 'Planificacion',
        dueDate,
        dueTone,
        labels: labelsForRow(row, dueTone),
        searchText: normalizeText([title, context?.project, context?.bucket, assignee, descriptionForRow(row, dueTone)].join(' ')),
        row,
      },
    ];
  });
}

function searchTextForItem(item: PlannerItem): string {
  return item.searchText ?? normalizeText(
    [
      item.title,
      item.description,
      item.assignee,
      item.project,
      item.bucket,
      item.dueDate,
      ...item.labels.map((label) => label.text),
    ].join(' '),
  );
}

function matchesPlannerChangeFilter(item: PlannerItem, filter: PlanningChangeFilter): boolean {
  if (item.row) {
    return matchesPlanningChangeFilter(item.row, filter);
  }

  if (filter === 'all') {
    return true;
  }

  if (filter === 'changed') {
    return item.dueTone !== 'normal';
  }

  if (filter === 'unchanged') {
    return item.dueTone === 'normal';
  }

  if (filter === 'unmatched') {
    return item.labels.some((label) => normalizeText(label.text) === 'nuevo');
  }

  return false;
}

function groupItemsByBucket(items: PlannerItem[], preferredOrder: string[]): Array<[string, PlannerItem[]]> {
  const groups = new Map<string, PlannerItem[]>();

  for (const bucket of preferredOrder) {
    groups.set(bucket, []);
  }

  for (const item of items) {
    const group = groups.get(item.bucket) ?? [];
    group.push(item);
    groups.set(item.bucket, group);
  }

  return Array.from(groups.entries()).filter(([, groupItems]) => groupItems.length > 0);
}

export function PlannerView({ rows }: PlannerViewProps) {
  const realItems = useMemo(() => itemsFromRows(rows), [rows]);
  const isDemo = realItems.length === 0;
  const sourceItems = isDemo ? demoItems : realItems;
  const [filters, setFilters] = useState(initialPlanningFilters);
  const [selectedItem, setSelectedItem] = useState<PlannerItem | null>(null);

  const assignees = useMemo(
    () => uniqueSorted(sourceItems.flatMap((item) => splitAssignees(item.assignee).map((person) => person.label))),
    [sourceItems],
  );
  const projects = useMemo(
    () => uniqueSorted(sourceItems.map((item) => item.project)),
    [sourceItems],
  );
  const projectOptions = useMemo(() => optionsFromLabels(projects), [projects]);
  const assigneeOptions = useMemo(() => optionsFromLabels(assignees), [assignees]);

  const normalizedSearch = normalizeText(filters.searchTerm);
  const filteredItems = sourceItems.filter((item) => {
    const matchesSearch = !normalizedSearch || searchTextForItem(item).includes(normalizedSearch);
    const matchesAssignee =
      filters.assignee === 'all' || assigneeTextMatches(item.assignee, new Set([normalizeText(filters.assignee)]));
    const matchesProject = filters.project === 'all' || item.project === filters.project;
    const matchesChange = matchesPlannerChangeFilter(item, filters.change);
    return matchesSearch && matchesAssignee && matchesProject && matchesChange;
  });

  const columnOrder = isDemo
    ? demoColumnOrder
    : Array.from(new Set(sourceItems.map((item) => item.bucket)));
  const columns = groupItemsByBucket(filteredItems, columnOrder);

  return (
    <section className="planner-view" aria-label="Vista Planner">
      <PlanningFiltersBar
        filters={filters}
        projectOptions={projectOptions}
        assigneeOptions={assigneeOptions}
        onFiltersChange={setFilters}
        onClearFilters={() => setFilters(initialPlanningFilters)}
      />

      <div className="planner-board-shell">
        <div className="planner-board">
          {columns.length === 0 ? (
            <div className="planner-empty">No hay elementos para los filtros seleccionados.</div>
          ) : (
            columns.map(([bucket, items]) => (
              <section className="planner-column" key={bucket}>
                <h3>{bucket}</h3>
                <button className="planner-add-button" type="button">
                  <span aria-hidden="true">+</span>
                  Añadir elemento
                </button>
                <div className="planner-card-list">
                  {items.map((item) => (
                    <button
                      type="button"
                      className="planner-card"
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                    >
                      {item.labels.length > 0 && (
                        <div className="planner-labels">
                          {item.labels.map((label) => (
                            <span className={`planner-label label-${label.tone}`} key={label.text}>
                              {label.text}
                            </span>
                          ))}
                        </div>
                      )}
                      <span className="planner-card-title">{item.title}</span>
                      {item.description && (
                        <span className="planner-card-description">{item.description}</span>
                      )}
                      <span className="planner-card-meta">
                        <span className={`planner-date date-${item.dueTone}`}>
                          {formatCompactDate(item.dueDate)}
                        </span>
                        {item.checklist && <span className="planner-mini-meta">{item.checklist}</span>}
                        {typeof item.infoCount === 'number' && (
                          <span className="planner-mini-meta">{item.infoCount} info</span>
                        )}
                        <span className="planner-avatar" title={item.assignee}>
                          {getInitials(item.assignee)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      {selectedItem?.row && (
        <EventDetailModal
          row={selectedItem.row}
          project={selectedItem.project}
          dueDate={selectedItem.dueDate}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </section>
  );
}
