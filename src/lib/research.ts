export type ResearchModule = {
  frontmatter?: {
    title?: string;
    stockLabel?: string;
    date?: string;
    pdf?: string;
  };
};

export type ResearchEntry = {
  slug: string;
  stockLabel: string;
  title: string;
  date: string;
  pdf: string;
};

export const RESEARCH_PAGE_SIZE = 10;

const getDateValue = (date: string): number => {
  const parsed = Date.parse(date);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const loadResearchEntries = (): ResearchEntry[] => {
  const researchModules = import.meta.glob<ResearchModule>(
    "../../content/research/*.md",
    { eager: true },
  );

  return Object.entries(researchModules)
    .map(([filePath, mod]) => {
      const slug = filePath.split("/").pop()?.replace(/\.md$/, "") ?? "";
      const fm = mod.frontmatter ?? {};

      return {
        slug,
        stockLabel: fm.stockLabel?.trim() || "",
        title: fm.title?.trim() || slug,
        date: fm.date?.trim() || "",
        pdf: fm.pdf?.trim() || "",
      };
    })
    .sort((a, b) => getDateValue(b.date) - getDateValue(a.date));
};

export const getResearchPage = (
  entries: ResearchEntry[],
  page: number,
  pageSize = RESEARCH_PAGE_SIZE,
) => {
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageEntries = entries.slice(start, start + pageSize);

  return { pageEntries, totalPages, currentPage };
};
