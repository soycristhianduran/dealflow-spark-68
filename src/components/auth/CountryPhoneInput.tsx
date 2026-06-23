import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Country {
  code: string;
  name: string;
  dial: string;
  flag: string;
}

const countries: Country[] = [
  { code: "MX", name: "México", dial: "+52", flag: "🇲🇽" },
  { code: "US", name: "Estados Unidos", dial: "+1", flag: "🇺🇸" },
  { code: "CO", name: "Colombia", dial: "+57", flag: "🇨🇴" },
  { code: "AR", name: "Argentina", dial: "+54", flag: "🇦🇷" },
  { code: "CL", name: "Chile", dial: "+56", flag: "🇨🇱" },
  { code: "PE", name: "Perú", dial: "+51", flag: "🇵🇪" },
  { code: "EC", name: "Ecuador", dial: "+593", flag: "🇪🇨" },
  { code: "VE", name: "Venezuela", dial: "+58", flag: "🇻🇪" },
  { code: "GT", name: "Guatemala", dial: "+502", flag: "🇬🇹" },
  { code: "CU", name: "Cuba", dial: "+53", flag: "🇨🇺" },
  { code: "DO", name: "República Dominicana", dial: "+1", flag: "🇩🇴" },
  { code: "HN", name: "Honduras", dial: "+504", flag: "🇭🇳" },
  { code: "SV", name: "El Salvador", dial: "+503", flag: "🇸🇻" },
  { code: "NI", name: "Nicaragua", dial: "+505", flag: "🇳🇮" },
  { code: "CR", name: "Costa Rica", dial: "+506", flag: "🇨🇷" },
  { code: "PA", name: "Panamá", dial: "+507", flag: "🇵🇦" },
  { code: "UY", name: "Uruguay", dial: "+598", flag: "🇺🇾" },
  { code: "PY", name: "Paraguay", dial: "+595", flag: "🇵🇾" },
  { code: "BO", name: "Bolivia", dial: "+591", flag: "🇧🇴" },
  { code: "BR", name: "Brasil", dial: "+55", flag: "🇧🇷" },
  { code: "ES", name: "España", dial: "+34", flag: "🇪🇸" },
  { code: "GB", name: "Reino Unido", dial: "+44", flag: "🇬🇧" },
  { code: "FR", name: "Francia", dial: "+33", flag: "🇫🇷" },
  { code: "DE", name: "Alemania", dial: "+49", flag: "🇩🇪" },
  { code: "IT", name: "Italia", dial: "+39", flag: "🇮🇹" },
  { code: "PT", name: "Portugal", dial: "+351", flag: "🇵🇹" },
  { code: "CA", name: "Canadá", dial: "+1", flag: "🇨🇦" },
  { code: "JP", name: "Japón", dial: "+81", flag: "🇯🇵" },
  { code: "CN", name: "China", dial: "+86", flag: "🇨🇳" },
  { code: "IN", name: "India", dial: "+91", flag: "🇮🇳" },
];

interface CountryPhoneInputProps {
  value: string;
  onChange: (fullPhone: string) => void;
  countryCode: string;
  onCountryChange: (code: string) => void;
}

export function CountryPhoneInput({ value, onChange, countryCode, onCountryChange }: CountryPhoneInputProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const selected = countries.find(c => c.code === countryCode) || countries[0];

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[110px] justify-between px-2 font-normal"
            type="button"
          >
            <span className="text-base mr-1">{selected.flag}</span>
            <span className="text-xs text-muted-foreground">{selected.dial}</span>
            <ChevronDown className="ml-auto h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0" align="start">
          <Command>
            <CommandInput placeholder={t("countryPhoneInput.searchPlaceholder")} />
            <CommandList>
              <CommandEmpty>{t("countryPhoneInput.notFound")}</CommandEmpty>
              <CommandGroup>
                {countries.map(c => (
                  <CommandItem
                    key={c.code}
                    value={`${c.name} ${c.dial}`}
                    onSelect={() => {
                      onCountryChange(c.code);
                      setOpen(false);
                    }}
                  >
                    <span className="text-base mr-2">{c.flag}</span>
                    <span className="flex-1 text-sm">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.dial}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Input
        type="tel"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="55 1234 5678"
        className="flex-1"
      />
    </div>
  );
}

export function getDialCode(countryCode: string): string {
  return countries.find(c => c.code === countryCode)?.dial || "+52";
}

export function detectCountryByTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzMap: Record<string, string> = {
      "America/Mexico_City": "MX", "America/Monterrey": "MX", "America/Cancun": "MX", "America/Tijuana": "MX",
      "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Los_Angeles": "US",
      "America/Bogota": "CO", "America/Argentina/Buenos_Aires": "AR", "America/Santiago": "CL",
      "America/Lima": "PE", "America/Guayaquil": "EC", "America/Caracas": "VE",
      "America/Guatemala": "GT", "America/Havana": "CU", "America/Santo_Domingo": "DO",
      "America/Tegucigalpa": "HN", "America/El_Salvador": "SV", "America/Managua": "NI",
      "America/Costa_Rica": "CR", "America/Panama": "PA", "America/Montevideo": "UY",
      "America/Asuncion": "PY", "America/La_Paz": "BO", "America/Sao_Paulo": "BR",
      "Europe/Madrid": "ES", "Europe/London": "GB", "Europe/Paris": "FR",
      "Europe/Berlin": "DE", "Europe/Rome": "IT", "Europe/Lisbon": "PT",
      "America/Toronto": "CA", "Asia/Tokyo": "JP", "Asia/Shanghai": "CN", "Asia/Kolkata": "IN",
    };
    return tzMap[tz] || "MX";
  } catch {
    return "MX";
  }
}
