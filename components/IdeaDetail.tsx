"use client";

import { useEffect, useState } from "react";

import {
  ArrowLeftIcon,
  ExternalIcon,
  LinkIcon,
  LockIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@/components/Icons";
import { ExplorePanel } from "@/components/ExplorePanel";
import { addTags, addUserLink } from "@/lib/ideas";
import { formatDateTime } from "@/lib/format";
import {
  IDEA_STATUSES,
  IDEA_STATUS_LABELS,
  MOTIVATIONS,
  MOTIVATION_LABELS,
  type ExploreReport,
  type Idea,
  type PublicServiceStatus,
} from "@/lib/types";

export function IdeaDetail({
  idea,
  reports,
  serviceStatus,
  serviceError,
  onUpdate,
  onDelete,
  onBack,
  onGenerated,
  onRequestDeleteReport,
  onNotify,
}: {
  idea: Idea;
  reports: ExploreReport[];
  serviceStatus: PublicServiceStatus | null;
  serviceError: string | null;
  onUpdate: (patch: Partial<Omit<Idea, "id" | "originalText" | "createdAt">>) => void;
  onDelete: () => void;
  onBack: () => void;
  onGenerated: (report: ExploreReport) => { ok: boolean; error?: string };
  onRequestDeleteReport: (report: ExploreReport) => void;
  onNotify: (message: string, kind?: "success" | "error" | "info") => void;
}) {
  const [titleDraft, setTitleDraft] = useState(idea.title);
  const [tagDraft, setTagDraft] = useState("");
  const [tagError, setTagError] = useState("");
  const [linkDraft, setLinkDraft] = useState("");
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    setTitleDraft(idea.title);
  }, [idea.id, idea.title]);

  const commitTitle = () => {
    const next = titleDraft.trim();
    if (!next) {
      setTitleDraft(idea.title);
      return;
    }
    if (next !== idea.title) onUpdate({ title: next });
  };

  const commitTag = () => {
    if (!tagDraft.trim()) return;
    const result = addTags(idea.tags, tagDraft);
    if (result.error) {
      setTagError(result.error);
      return;
    }
    onUpdate({ tags: result.tags });
    setTagDraft("");
    setTagError("");
  };

  const commitLink = () => {
    const result = addUserLink(idea.userLinks, linkDraft);
    if (result.error) {
      setLinkError(result.error);
      return;
    }
    onUpdate({ userLinks: result.links });
    setLinkDraft("");
    setLinkError("");
  };

  return (
    <div className="detail-pane">
      <div className="detail-topbar">
        <button type="button" className="btn btn-ghost btn-small mobile-back" onClick={onBack}>
          <ArrowLeftIcon size={16} />
          返回灵感库
        </button>
        <div className="detail-topbar-meta">
          <span className="micro">灵感详情</span>
          {idea.isExample ? <span className="example-tag">示例</span> : null}
        </div>
        <button type="button" className="btn btn-ghost btn-small danger-text" onClick={onDelete}>
          <TrashIcon size={15} />
          删除
        </button>
      </div>

      <div className="detail-body">
        <header className="detail-heading">
          <div className="detail-heading-meta">
            <span className={`status-pill status-${idea.status}`}>
              {IDEA_STATUS_LABELS[idea.status]}
            </span>
            <span className="micro">创建于 {formatDateTime(idea.createdAt)}</span>
          </div>
          <label className="sr-only" htmlFor="idea-title">
            灵感标题
          </label>
          <input
            id="idea-title"
            className="title-input"
            value={titleDraft}
            maxLength={100}
            onChange={(event) => {
              const value = event.target.value;
              setTitleDraft(value);
              if (value.trim()) onUpdate({ title: value });
            }}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
          <div className="autosave">
            <span className="autosave-dot" aria-hidden="true" />
            已自动保存到本机 · {formatDateTime(idea.updatedAt)}
          </div>
        </header>

        <section className="original-card" aria-labelledby="original-title">
          <div className="original-head">
            <span id="original-title" className="section-kicker">
              <LockIcon size={13} /> 初始原文 · 只读
            </span>
            <span className="micro">编辑不会覆盖这句话</span>
          </div>
          <p className="original-text">{idea.originalText}</p>
        </section>

        <section className="editor" aria-labelledby="editor-title">
          <div className="section-heading">
            <div>
              <div className="section-kicker">打磨想法</div>
              <h2 id="editor-title">补充上下文</h2>
            </div>
          </div>

          <div className="field">
            <label htmlFor="idea-content">补充说明</label>
            <textarea
              id="idea-content"
              value={idea.content}
              rows={5}
              maxLength={3000}
              onChange={(event) => onUpdate({ content: event.target.value })}
              placeholder="想解决什么问题？给谁用？为什么现在想做？"
            />
            <div className="field-hint">
              <span>把模糊的直觉写具体，探索时会更有帮助。</span>
              <span>{idea.content.length}/3000</span>
            </div>
          </div>

          <div className="field-grid">
            <fieldset className="field fieldset">
              <legend>状态</legend>
              <div className="segmented" role="group" aria-label="灵感状态">
                {IDEA_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`segment${idea.status === status ? " is-active" : ""}`}
                    aria-pressed={idea.status === status}
                    onClick={() => onUpdate({ status })}
                  >
                    {IDEA_STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="field fieldset">
              <legend>创作动机</legend>
              <div className="motivation-list" role="group" aria-label="创作动机">
                <button
                  type="button"
                  className={`choice${idea.motivation === null ? " is-active" : ""}`}
                  aria-pressed={idea.motivation === null}
                  onClick={() => onUpdate({ motivation: null })}
                >
                  未填写
                </button>
                {MOTIVATIONS.map((motivation) => (
                  <button
                    key={motivation}
                    type="button"
                    className={`choice${idea.motivation === motivation ? " is-active" : ""}`}
                    aria-pressed={idea.motivation === motivation}
                    onClick={() => onUpdate({ motivation })}
                  >
                    {MOTIVATION_LABELS[motivation]}
                  </button>
                ))}
              </div>
              <p className="field-hint">不是分类考核，只是留给未来回看的线索。</p>
            </fieldset>
          </div>

          <div className="field">
            <label htmlFor="tag-input">标签</label>
            <div className="inline-input">
              <input
                id="tag-input"
                value={tagDraft}
                maxLength={20}
                onChange={(event) => {
                  setTagDraft(event.target.value);
                  if (tagError) setTagError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitTag();
                  }
                }}
                placeholder="输入标签后回车，如：效率"
              />
              <button type="button" className="btn btn-ghost btn-small" onClick={commitTag}>
                <PlusIcon size={15} />
                添加
              </button>
            </div>
            {idea.tags.length ? (
              <div className="editable-tags">
                {idea.tags.map((tag) => (
                  <span key={tag} className="editable-tag">
                    #{tag}
                    <button
                      type="button"
                      onClick={() =>
                        onUpdate({ tags: idea.tags.filter((item) => item !== tag) })
                      }
                      aria-label={`移除标签 ${tag}`}
                    >
                      <XIcon size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="field-hint">最多 8 个标签，每个 20 字以内。</p>
            )}
            {tagError ? (
              <p className="field-error" role="alert">
                {tagError}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="link-input">
              <LinkIcon size={14} /> 手动补充来源链接
            </label>
            <div className="inline-input">
              <input
                id="link-input"
                type="url"
                inputMode="url"
                value={linkDraft}
                maxLength={500}
                onChange={(event) => {
                  setLinkDraft(event.target.value);
                  if (linkError) setLinkError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitLink();
                  }
                }}
                placeholder="https://…"
              />
              <button type="button" className="btn btn-ghost btn-small" onClick={commitLink}>
                <PlusIcon size={15} />
                添加
              </button>
            </div>
            <p className="field-hint">
              最多 5 条。系统不会访问这些链接，它们只会作为待核实来源显示，不能当作已读证据。
            </p>
            {idea.userLinks.length ? (
              <ul className="link-list">
                {idea.userLinks.map((link) => (
                  <li key={link}>
                    <a href={link} target="_blank" rel="noopener noreferrer" title={link}>
                      {link}
                      <ExternalIcon size={12} />
                    </a>
                    <span className="unread-badge">未读取</span>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`移除链接 ${link}`}
                      onClick={() =>
                        onUpdate({
                          userLinks: idea.userLinks.filter((item) => item !== link),
                        })
                      }
                    >
                      <XIcon size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {linkError ? (
              <p className="field-error" role="alert">
                {linkError}
              </p>
            ) : null}
          </div>
        </section>

        <ExplorePanel
          key={idea.id}
          idea={idea}
          serviceStatus={serviceStatus}
          serviceError={serviceError}
          reports={reports}
          onGenerated={onGenerated}
          onRequestDeleteReport={onRequestDeleteReport}
          onNotify={onNotify}
        />
      </div>
    </div>
  );
}
