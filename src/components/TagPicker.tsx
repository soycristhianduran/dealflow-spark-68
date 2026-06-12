/**
 * TagPicker — type-ahead dropdown backed by the org's central tag catalog
 * (Settings → Tags / useOrgTags). Picking from the list or typing a new tag both
 * work; a newly typed tag is persisted to the catalog so it shows up everywhere
 * (Settings, automations, Leads).
 */
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { useOrgTags } from "@/hooks/useOrgTags";

interface TagPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** When true (default) a typed-in tag not yet in the catalog is created/persisted. */
  allowCreate?: boolean;
  className?: string;
}

export function TagPicker({ value, onChange, placeholder, allowCreate = true, className }: TagPickerProps) {
  const { tags, addTag } = useOrgTags();
  const listId = useId();

  return (
    <>
      <Input
        list={listId}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => { if (allowCreate && value.trim()) void addTag(value.trim()); }}
        placeholder={placeholder}
        className={className ?? "mt-1"}
      />
      <datalist id={listId}>
        {tags.map(t => <option key={t} value={t} />)}
      </datalist>
    </>
  );
}
