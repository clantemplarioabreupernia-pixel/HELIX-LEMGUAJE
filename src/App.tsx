/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { ArrowLeftRight, Binary, BookOpen, Box, Code2, Cpu, Download, FileCode2, Grid3x3, Terminal } from 'lucide-react';
import { HELIX_OPERATORS, RUNES } from './data/runes';
import { CompoundWord, INITIAL_COMPOUND_VOCABULARY } from './data/vocabulary';
import { VocabularyView } from './components/VocabularyView';
import { SyntaxParserView } from './components/SyntaxParserView';
import { GeneratorView } from './components/GeneratorView';
import { SpecificationView } from './components/SpecificationView';
import { RunesTableView } from './components/RunesTableView';
import { TranspilerView } from './components/TranspilerView';
import { VmShellView } from './components/VmShellView';
import { MeshStudio3DView } from './components/MeshStudio3DView';
import { AiProtocolView } from './components/AiProtocolView';
import { DEFAULT_HELIX_PROGRAM } from './utils/helixVm';
import { DEFAULT_HELIX_CELLS, HelixCell, verifyCellsForProgram } from './utils/helixCells';

type ModuleId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'runes';

const STORAGE_KEY = 'helix_os_custom_vocabulary_v1';
const CELLS_STORAGE_KEY = 'helix_os_custom_cells_v1';

const NAV_ITEMS: {
  id: ModuleId;
  label: string;
  breadcrumb: string;
  icon: typeof BookOpen;
}[] = [
  {
    id: 'A',
    label: 'A · Léxico compuesto',
    breadcrumb: 'Módulo A · Léxico de instrucciones binarias',
    icon: BookOpen,
  },
  {
    id: 'B',
    label: 'B · Sintaxis y Parser',
    breadcrumb: 'Módulo B · Gramática y AST',
    icon: Code2,
  },
  {
    id: 'C',
    label: 'C · Síntesis y Gödel',
    breadcrumb: 'Módulo C · Generación combinatoria y factorización',
    icon: Cpu,
  },
  {
    id: 'D',
    label: 'D · Especificación',
    breadcrumb: 'Módulo D · Arquitectura de 6 capas',
    icon: FileCode2,
  },
  {
    id: 'E',
    label: 'E · Transpilador',
    breadcrumb: 'Módulo E · Transpilador determinista bidireccional',
    icon: ArrowLeftRight,
  },
  {
    id: 'F',
    label: 'F · VM y Shell',
    breadcrumb: 'Módulo F · Máquina Virtual, REPL y Código Go',
    icon: Terminal,
  },
  {
    id: 'G',
    label: 'G · Estudio 3D y WS',
    breadcrumb: 'Módulo G · Motor 3D glTF/ORM y WebSocket en Vivo',
    icon: Box,
  },
  {
    id: 'H',
    label: 'H · Protocolo IA',
    breadcrumb: 'Módulo H · Decodificación Cero-Alucinaciones y Mini-GPT Helix',
    icon: Binary,
  },
  {
    id: 'runes',
    label: 'Tabla de 33 Tokens',
    breadcrumb: 'Referencia · Léxico base de 33 tokens',
    icon: Grid3x3,
  },
];

export default function App() {
  const [activeModule, setActiveModule] = useState<ModuleId>('A');
  const [parserExpression, setParserExpression] = useState('ᚠᚢᚦ');
  const [vmScript, setVmScript] = useState(DEFAULT_HELIX_PROGRAM);
  const [customWords, setCustomWords] = useState<CompoundWord[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as CompoundWord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [helixCells, setHelixCells] = useState<HelixCell[]>(() => {
    try {
      const raw = localStorage.getItem(CELLS_STORAGE_KEY);
      if (!raw) return DEFAULT_HELIX_CELLS;
      const parsed = JSON.parse(raw) as HelixCell[];
      if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_HELIX_CELLS;
      const validStored = parsed.filter((c) => verifyCellsForProgram([c]).length === 0);
      return [
        ...validStored,
        ...DEFAULT_HELIX_CELLS.filter(
          (base) => !validStored.some((c) => c.fileName === base.fileName),
        ),
      ];
    } catch {
      return DEFAULT_HELIX_CELLS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customWords));
    } catch {
      // Ignore storage quota errors
    }
  }, [customWords]);

  useEffect(() => {
    try {
      localStorage.setItem(CELLS_STORAGE_KEY, JSON.stringify(helixCells));
    } catch {
      // Ignore storage quota errors
    }
  }, [helixCells]);

  const fullVocabulary: CompoundWord[] = [
    ...customWords,
    ...INITIAL_COMPOUND_VOCABULARY.filter(
      (base) => !customWords.some((c) => c.glyphs === base.glyphs),
    ),
  ];

  const handleAddWord = (word: CompoundWord) => {
    setCustomWords((prev) => [word, ...prev.filter((w) => w.glyphs !== word.glyphs)]);
  };

  const handleRemoveWord = (id: string) => {
    setCustomWords((prev) => prev.filter((w) => w.id !== id));
  };

  const handleOpenInParser = (glyphs: string) => {
    setParserExpression(glyphs);
    setActiveModule('B');
  };

  const handleOpenInVm = (nextScript: string) => {
    setVmScript(nextScript);
    setActiveModule('F');
  };

  const handleOpenIn3DStudio = (nextScript: string) => {
    setVmScript(nextScript);
    setActiveModule('G');
  };

  const handleSaveHelixCell = (nextCell: HelixCell) => {
    setHelixCells((prev) => {
      const exists = prev.some(
        (c) => c.fileName === nextCell.fileName || c.opcode === nextCell.opcode,
      );
      if (exists) {
        return prev.map((c) =>
          c.fileName === nextCell.fileName || c.opcode === nextCell.opcode ? nextCell : c,
        );
      }
      return [nextCell, ...prev];
    });
  };

  const handleDeleteHelixCell = (fileName: string) => {
    setHelixCells((prev) => prev.filter((c) => c.fileName !== fileName));
  };

  const handleResetHelixCells = () => {
    setHelixCells(DEFAULT_HELIX_CELLS);
  };

  const handleExportJson = () => {
    const payload = {
      language: 'Helix OS Symbolic Language',
      version: '1.5',
      layers: [
        'Glifo (Vector SVG)',
        'Fonema AFI',
        'Primo (Gödel)',
        'Frecuencia (Hz)',
        'Opcode SO',
        'Color procedural H(p) = (p * 137.507764°) mod 360°',
      ],
      visualRendering: {
        directions: ['LTR (Izquierda a Derecha)', 'TTB (Arriba a Abajo)'],
        writingModes: ['Secuencial', 'Enlazado'],
        colorSynthesis: 'Circular Vector Mean atan2(sum(sin H), sum(cos H))',
      },
      tokenCount: RUNES.length,
      tokens: RUNES,
      operators: HELIX_OPERATORS,
      grammar: {
        lexeme: '<Lexema> ::= <Token> | <Token><Token>',
        statement: '<Sentencia> ::= <Entidad> <Operación> <Modificador>*',
        expression: '<Expr> ::= <Cláusula> ( (⊕|⊗|⊖|⊡) <Cláusula> )*',
      },
      lexicon: fullVocabulary,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'helix-os-language-spec.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activeNav = NAV_ITEMS.find((item) => item.id === activeModule) ?? NAV_ITEMS[0];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-14 items-center border-b border-slate-200 px-5">
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Helix OS
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Módulos del lenguaje">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveModule(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 px-5 py-4 text-xs text-slate-500">
          <div className="font-mono tabular-nums">33 tokens · {fullVocabulary.length} opcodes</div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-8 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="font-display font-semibold text-slate-900 lg:hidden whitespace-nowrap shrink-0">
              Helix OS
            </span>
            <span className="text-slate-300 lg:hidden" aria-hidden="true">/</span>
            <span className="truncate text-xs font-medium text-slate-600 sm:text-sm">
              {activeNav.breadcrumb}
            </span>
          </div>

          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar JSON
          </button>
        </header>

        {/* Mobile/Tablet Horizontal Module Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveModule(item.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeModule === item.id
                  ? 'bg-blue-50 text-blue-800'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Workspace Viewport */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {activeModule === 'A' && (
            <VocabularyView
              vocabulary={fullVocabulary}
              onAddWord={handleAddWord}
              onRemoveWord={handleRemoveWord}
              onOpenInParser={handleOpenInParser}
            />
          )}

          {activeModule === 'B' && (
            <SyntaxParserView
              expression={parserExpression}
              onChangeExpression={setParserExpression}
              vocabulary={fullVocabulary}
            />
          )}

          {activeModule === 'C' && (
            <GeneratorView
              vocabulary={fullVocabulary}
              onAddWord={handleAddWord}
              onOpenInParser={handleOpenInParser}
            />
          )}

          {activeModule === 'D' && (
            <SpecificationView
              vocabulary={fullVocabulary}
              onExportJson={handleExportJson}
              cells={helixCells}
              currentVmScript={vmScript}
              onSaveCell={handleSaveHelixCell}
              onDeleteCell={handleDeleteHelixCell}
              onResetAllCells={handleResetHelixCells}
              onTestCellInVm={handleOpenInVm}
            />
          )}

          {activeModule === 'E' && (
            <TranspilerView
              onOpenInParser={handleOpenInParser}
              onOpenInVm={handleOpenInVm}
            />
          )}

          {activeModule === 'F' && (
            <VmShellView
              vocabulary={fullVocabulary}
              script={vmScript}
              onChangeScript={setVmScript}
              cells={helixCells}
              onChangeCells={setHelixCells}
              onResetCells={handleResetHelixCells}
              onOpenIn3DStudio={(nextScript) => {
                setVmScript(nextScript);
                setActiveModule('G');
              }}
            />
          )}

          {activeModule === 'G' && (
            <MeshStudio3DView
              vocabulary={fullVocabulary}
              script={vmScript}
              onChangeScript={setVmScript}
            />
          )}

          {activeModule === 'H' && (
            <AiProtocolView
              vocabulary={fullVocabulary}
              cells={helixCells}
              onOpenInVm={handleOpenInVm}
              onOpenIn3DStudio={handleOpenIn3DStudio}
            />
          )}

          {activeModule === 'runes' && <RunesTableView />}
        </main>
      </div>
    </div>
  );
}
