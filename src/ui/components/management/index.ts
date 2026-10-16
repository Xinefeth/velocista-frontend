// Componentes comunes de las pantallas de gestión (EN-06). Usan las clases de styles/prototipo.css.
export { Tabs } from "@/ui/components/management/Tabs";
export type { TabItem } from "@/ui/components/management/Tabs";
export { SearchBox } from "@/ui/components/management/SearchBox";
export { FilterChips } from "@/ui/components/management/FilterChips";
export type { ChipOption } from "@/ui/components/management/FilterChips";
export { DataTable } from "@/ui/components/management/DataTable";
export type { Column } from "@/ui/components/management/DataTable";
export { InputField, SelectField } from "@/ui/components/management/Field";
export { DynamicForm } from "@/ui/components/management/DynamicForm";
export { useListFilter, normalizeText } from "@/ui/components/management/useListFilter";
export { validateFields, parseNumber } from "@/ui/components/management/validation";
export type {
  FieldDef,
  Errores,
  Valores,
  FieldOption,
  TipoCampo,
} from "@/ui/components/management/validation";
