"use client";

import { useMemo, useState } from "react";

import {
  ChevronDownIcon,
  PlusIcon,
  SearchIcon,
  SparkIcon,
} from "@/components/Icons";
import {
  collectTags,
  filterIdeas,
  type IdeaFilters,
} from "@/lib/ideas";
import { formatDate } from "@/lib/format";
import { truncate } from "@/lib/format";
import {
  IDEA_STATUSES,
  IDEA_STATUS_LABELS,
  type Idea,
} from "@/lib/types";

export function LibraryPanel({
  ideas,
  filters,
  onFiltersChange,
  selectedId,
  onSelect,
  onAdd,
  onLoadExamples,
  onClearExamples,
  storageWarning,
  saveError,
}: {
  ideas: Idea[];
  filters: IdeaFilters;
  onFiltersChange: (filters: IdeaFilters) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (text: string) => { ok: boolean; error?: string };
  onLoadExamples: () => void;
  onClearExamples: () => void;
  storageWarning: string | null;
  saveError: string | null;
}) {
  const [draft, setDraft] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [showAllTags, setShowAllTags] = useState(false);

  const tags = useMemo(() => collectTags(ideas), [ideas]);
  const filtered = useMemo(() => filterIdeas(ideas, filters), [ideas, filters]);
  const hasExamples = ideas.some((idea) => idea.isExample);
  const visibleTags = showAllTags ? tags : tags.slice(0, 12);
  const filtersActive =
    !!filters.query || filters.status !== "all" || filters.tag !== null;

  const submit = () => {
    const text = draft.trim();
    if (!text) {
      setCaptureError("先写下一句话再记下。");
      return;
    }
    if (text.length > 280) {
      setCaptureError("一句话最多 280 个字符。");
      return;
    }
    const result = onAdd(text);
    if (!result.ok) {
      setCaptureError(result.error ?? "记录失败，请稍后重试。");
      return;
    }
    setDraft("");
    setCaptureError("");
  };

  return (
    <aside className="library" id="library" aria-label="灵感库">
      <div className="library-inner">
        <section className="capture" aria-labelledby="capture-title">
          <div className="section-kicker">
            <span id="capture-title">快速记录</span>
            <span className="kicker-hint">不必分类</span>
          </div>
          <form
            className="capture-box"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label className="sr-only" htmlFor="quick-idea">
              记下一句灵感
            </label>
            <textarea
              id="quick-idea"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (captureError) setCaptureError("");
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={3}
              maxLength={280}
              placeholder="此刻冒出的一个点子…"
              aria-describedby="capture-help capture-error"
              aria-invalid={!!captureError}
            />
            <div className="capture-foot">
              <span id="capture-help" className="micro">
                {draft.length}/280 · Ctrl/⌘ + Enter 记下
              </span>
              <button
                type="submit"
                className="btn btn-primary btn-small"
                disabled={!draft.trim()}
              >
                <PlusIcon size={16} />
                记下
              </button>
            </div>
          </form>
          {captureError ? (
            <p id="capture-error" className="field-error" role="alert">
              {captureError}
            </p>
          ) : null}
        </section>

        {storageWarning ? (
          <div className="notice notice-error" role="alert">
            <strong>本地数据读取异常</strong>
            <p>{storageWarning}</p>
          </div>
        ) : null}
        {saveError ? (
          <div className="notice notice-error" role="alert">
            <strong>保存失败</strong>
            <p>{saveError}</p>
          </div>
        ) : null}

        <section className="library-tools" aria-label="筛选灵感">
          <div className="search-field">
            <SearchIcon size={17} />
            <label className="sr-only" htmlFor="idea-search">
              搜索灵感
            </label>
            <input
              id="idea-search"
              type="search"
              value={filters.query}
              onChange={(event) =>
                onFiltersChange({ ...filters, query: event.target.value })
              }
              placeholder="搜索标题、原文、标签…"
              autoComplete="off"
            />
          </div>
          <div className="filter-row">
            <div className="select-wrap">
              <label className="sr-only" htmlFor="status-filter">
                按状态筛选
              </label>
              <select
                id="status-filter"
                value={filters.status}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    status: event.target.value as IdeaFilters["status"],
                  })
                }
              >
                <option value="all">全部状态</option>
                {IDEA_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {IDEA_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
              <ChevronDownIcon size={15} />
            </div>
            <span className="result-count" aria-live="polite">
              显示 {filtered.length} / {ideas.length}
            </span>
            {filtersActive ? (
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  onFiltersChange({ query: "", status: "all", tag: null });
                  setShowAllTags(false);
                }}
              >
                清除筛选
              </button>
            ) : null}
          </div>

          {tags.length > 0 ? (
            <div className="tag-filter" role="group" aria-label="按标签筛选">
              <button
                type="button"
                className={`tag-chip${filters.tag === null ? " is-active" : ""}`}
                aria-pressed={filters.tag === null}
                onClick={() => onFiltersChange({ ...filters, tag: null })}
              >
                全部标签
              </button>
              {visibleTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`tag-chip${filters.tag === tag ? " is-active" : ""}`}
                  aria-pressed={filters.tag === tag}
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      tag: filters.tag === tag ? null : tag,
                    })
                  }
                >
                  #{tag}
                </button>
              ))}
              {tags.length > 12 ? (
                <button
                  type="button"
                  className="tag-chip tag-chip--more"
                  onClick={() => setShowAllTags((value) => !value)}
                >
                  {showAllTags ? "收起" : `+${tags.length - 12}`}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        {hasExamples ? (
          <div className="example-banner" role="note">
            <span>
              <SparkIcon size={14} /> 列表含示例灵感，仅用于体验，可随时删除。
            </span>
            <button type="button" className="text-btn" onClick={onClearExamples}>
              清除示例
            </button>
          </div>
        ) : null}

        <section className="idea-list" aria-label="灵感列表">
          {ideas.length === 0 ? (
            <div className="empty-library">
              <div className="empty-mark" aria-hidden="true">
                <SparkIcon size={26} />
              </div>
              <h2>从一句想法开始</h2>
              <p>
                没有账号，也没有同步。灵感与报告默认保存在当前浏览器的本地存储里；主动探索时会把必要内容发送给你配置的搜索与模型服务。
              </p>
              <button type="button" className="btn btn-ghost" onClick={onLoadExamples}>
                载入 3 条示例灵感
              </button>
              <p className="micro">
                仅在你点击后载入，并逐条标记为「示例」；不会自动生成任何数据。
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-filtered">
              <h2>没有符合条件的灵感</h2>
              <p>换个关键词、状态或标签试试。</p>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => onFiltersChange({ query: "", status: "all", tag: null })}
              >
                清除筛选
              </button>
            </div>
          ) : (
            <ul className="cards">
              {filtered.map((idea) => {
                const selected = idea.id === selectedId;
                const excerpt = idea.content.trim()
                  ? idea.content
                  : idea.originalText;
                return (
                  <li key={idea.id}>
                    <button
                      type="button"
                      className={`idea-card${selected ? " is-selected" : ""}`}
                      onClick={() => onSelect(idea.id)}
                      aria-current={selected ? "true" : undefined}
                    >
                      <span className="card-top">
                        <span className={`status-pill status-${idea.status}`}>
                          {IDEA_STATUS_LABELS[idea.status]}
                        </span>
                        <span className="card-meta">
                          {idea.isExample ? (
                            <span className="example-tag">示例</span>
                          ) : null}
                          <time dateTime={idea.createdAt}>
                            {formatDate(idea.createdAt)}
                          </time>
                        </span>
                      </span>
                      <span className="card-title">{idea.title}</span>
                      <span className="card-excerpt">{truncate(excerpt, 92)}</span>
                      {idea.tags.length ? (
                        <span className="card-tags">
                          {idea.tags.slice(0, 4).map((tag) => (
                            <span key={tag} className="mini-tag">
                              #{tag}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}
