/**
 * Searchable symbol picker — drop-in replacement for plain `<input>` boxes
 * that ask the user to type a ticker.
 *
 * Uses `react-select`'s AsyncCreatableSelect so the user can either pick a
 * known instrument from Angel One's scrip master (live debounced search) or
 * type a free-form symbol (e.g. "BANKNIFTY", "GOLD") that we resolve on
 * order placement.
 *
 * Theme-aware: pulls dark/light tokens from the existing palette so it
 * matches the rest of the UI exactly.
 */
import { useMemo } from 'react';
import AsyncCreatable from 'react-select/async-creatable';
import type { GroupBase, OptionsOrGroups, StylesConfig } from 'react-select';
import { searchSymbols } from '../api/market';
import { useTheme } from '../context/ThemeContext';

export interface SymbolOption {
  value: string;
  label: string;
  name?: string;
}

interface Props {
  value?: string;
  onChange: (symbol: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Seed the dropdown with a "popular" list when the user just opens it. */
  defaultOptions?: SymbolOption[];
  autoFocus?: boolean;
}

const POPULAR: SymbolOption[] = [
  { value: 'NIFTY',     label: 'NIFTY 50',     name: 'Index'      },
  { value: 'BANKNIFTY', label: 'NIFTY Bank',   name: 'Index'      },
  { value: 'SENSEX',    label: 'SENSEX',       name: 'Index'      },
  { value: 'GOLD',      label: 'GOLD',         name: 'MCX'        },
  { value: 'SILVER',    label: 'SILVER',       name: 'MCX'        },
  { value: 'CRUDEOIL',  label: 'CRUDEOIL',     name: 'MCX'        },
  { value: 'RELIANCE',  label: 'RELIANCE',     name: 'NSE Equity' },
  { value: 'TCS',       label: 'TCS',          name: 'NSE Equity' },
  { value: 'INFY',      label: 'INFY',         name: 'NSE Equity' },
  { value: 'HDFCBANK',  label: 'HDFCBANK',     name: 'NSE Equity' },
  { value: 'ICICIBANK', label: 'ICICIBANK',    name: 'NSE Equity' },
  { value: 'SBIN',      label: 'SBIN',         name: 'NSE Equity' },
];

export function SymbolSelect({
  value, onChange, placeholder, disabled, defaultOptions, autoFocus,
}: Props) {
  const { theme } = useTheme();

  const styles = useMemo<StylesConfig<SymbolOption, false>>(
    () => themedStyles(theme === 'dark'),
    [theme]
  );

  const loadOptions = async (input: string): Promise<OptionsOrGroups<SymbolOption, GroupBase<SymbolOption>>> => {
    const q = input.trim();
    if (!q) return defaultOptions || POPULAR;
    try {
      const r = await searchSymbols(q);
      return r.results.map((s) => ({
        value: s.symbol.toUpperCase(),
        label: s.symbol.toUpperCase(),
        name: s.name,
      }));
    } catch {
      return [];
    }
  };

  const selected: SymbolOption | null = value
    ? { value: value.toUpperCase(), label: value.toUpperCase() }
    : null;

  return (
    <AsyncCreatable
      isClearable
      autoFocus={autoFocus}
      isDisabled={disabled}
      placeholder={placeholder || 'Search a stock, index or commodity'}
      noOptionsMessage={({ inputValue }) =>
        inputValue ? 'No matches — press Enter to use as-is' : 'Start typing…'
      }
      formatCreateLabel={(input) => `Use “${input.toUpperCase()}” as symbol`}
      defaultOptions={defaultOptions || POPULAR}
      loadOptions={loadOptions}
      cacheOptions
      value={selected}
      onChange={(opt) => onChange(opt ? (opt as SymbolOption).value.toUpperCase() : '')}
      onCreateOption={(input) => onChange(input.toUpperCase())}
      styles={styles}
      classNamePrefix="symsel"
      menuPlacement="auto"
      menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
      menuPosition="fixed"
      components={{
        Option: (props) => {
          const opt = props.data as SymbolOption;
          return (
            <div
              {...props.innerProps}
              ref={props.innerRef}
              className={`cursor-pointer px-3 py-2 flex items-center justify-between gap-2 ${
                props.isFocused ? 'bg-brand/10' : ''
              } ${props.isSelected ? 'bg-brand/15' : ''}`}
            >
              <span className="font-semibold text-sm tracking-tight">{opt.value}</span>
              {opt.name && (
                <span className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-night-200">
                  {opt.name}
                </span>
              )}
            </div>
          );
        },
      }}
    />
  );
}

function themedStyles(dark: boolean): StylesConfig<SymbolOption, false> {
  const bg       = dark ? '#1e2532' : '#ffffff';
  const bgInput  = dark ? '#1e2532' : '#ffffff';
  const border   = dark ? '#3a4254' : '#dde0e6';
  const borderH  = dark ? '#525c70' : '#c0c5cf';
  const text     = dark ? '#e6edf3' : '#1c1d20';
  const muted    = dark ? '#b0b8c8' : '#696c75';
  const brand    = '#5367ff';
  const menuBg   = dark ? '#161b26' : '#ffffff';

  return {
    container: (b) => ({ ...b, width: '100%' }),
    control: (b, s) => ({
      ...b,
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: bgInput,
      borderColor: s.isFocused ? brand : border,
      boxShadow: s.isFocused ? `0 0 0 3px ${brand}40` : 'none',
      ':hover': { borderColor: borderH },
      transition: 'border-color 120ms, box-shadow 120ms',
    }),
    valueContainer: (b) => ({ ...b, padding: '0 12px' }),
    singleValue: (b) => ({ ...b, color: text, fontWeight: 600 }),
    input:       (b) => ({ ...b, color: text }),
    placeholder: (b) => ({ ...b, color: muted, fontSize: 14 }),
    indicatorSeparator: (b) => ({ ...b, backgroundColor: border }),
    dropdownIndicator:  (b) => ({ ...b, color: muted, ':hover': { color: text } }),
    clearIndicator:     (b) => ({ ...b, color: muted, ':hover': { color: text } }),
    loadingIndicator:   (b) => ({ ...b, color: muted }),
    menu: (b) => ({
      ...b,
      backgroundColor: menuBg,
      borderRadius: 12,
      border: `1px solid ${border}`,
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      overflow: 'hidden',
      marginTop: 4,
      zIndex: 60,
    }),
    menuPortal: (b) => ({ ...b, zIndex: 60 }),
    menuList: (b) => ({ ...b, padding: 4, color: text }),
    noOptionsMessage: (b) => ({ ...b, color: muted, fontSize: 13 }),
    loadingMessage:   (b) => ({ ...b, color: muted, fontSize: 13 }),
  };
}
