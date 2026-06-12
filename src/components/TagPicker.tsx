/**
 * TagPicker — a real dropdown combobox backed by the org's central tag catalog
 * (Settings → Tags / useOrgTags). Always shows ALL catalog tags, supports search,
 * and (optionally) creating a new tag inline — which persists to the catalog so it
 * appears everywhere (Settings, automations, Leads).
 */
import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useOrgTags } from "@/hooks/useOrgTags";

interface TagPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** When true (default) a typed-in tag not yet in the catalog can be created. */
  allowCreate?: boolean;
}

export function TagPicker({ value, onChange, placeholder, allowCreate = true }: TagPickerProps) {
  const { tags, addTag } = useOrgTags();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const term = search.trim();
  const exactExists = tags.some(t => t.toLowerCase() === term.toLowerCase());

  const select = (tag: string) => { onChange(tag); setOpen(false); setSearch(""); };

  const create = async () => {
    const created = await addTag(term);
    if (created) select(created);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="mt-1 w-full justify-between font-normal"
        >
          <span className={cn(!value && "text-muted-foreground")}>
            {value || placeholder || "Elige una etiqueta"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar o crear..." value={search} onValueChange={setSearch} />
          <CommandList>
            {tags.length === 0 && !term && (
              <CommandEmpty>No hay etiquetas. Escribe para crear una.</CommandEmpty>
            )}
            <CommandGroup>
              {tags.map(tag => (
                <CommandItem key={tag} value={tag} onSelect={() => select(tag)}>
                  <Check className={cn("mr-2 h-4 w-4", value === tag ? "opacity-100" : "opacity-0")} />
                  {tag}
                </CommandItem>
              ))}
            </CommandGroup>
            {allowCreate && term && !exactExists && (
              <CommandGroup>
                <CommandItem value={`__create__${term}`} onSelect={create}>
                  <Plus className="mr-2 h-4 w-4" />
                  Crear "{term}"
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
