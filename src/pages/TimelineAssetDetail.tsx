import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Code2, ExternalLink, FileText, Flag, Image, Loader2, MoreVertical, Music2, Play, Video } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { nip19 } from 'nostr-tools';
import { getCatalogClient } from '../catalog/catalogClient';
import type { TimelineAssetDetail as TimelineAssetDetailType } from '../catalog/catalog';
import { TimelineThumbnail, type KnownServersFor } from '../components/TimelineThumbnail';
import { useNostr } from '../utils/nostr';
import { useGlobalContext } from '../GlobalState';
import { useServerInfo, type ServerInfo } from '../utils/useServerInfo';
import { formatDate, formatFileSize } from '../utils/utils';
import { probeNativeUrl } from '../catalog/availabilityFetch';
import { eventKindLabel } from '../catalog/eventKinds';
import { eventBody } from '../catalog/timelineMetadata';
import { NostrText } from '../components/NostrText';

import { ReportDialog } from '../components/Browse/ReportDialog';
import { BrowseActionPlanDialog } from '../components/Browse/BrowseActionPlanDialog';
const TYPE_ICON = {
  image: Image,
  video: Video,
  audio: Music2,
  document: FileText,
  unknown: FileText,
};

const AVAILABILITY_LABEL = {
  complete: '✅ Available',
  partial: 'Partially available',
  unavailable: 'Unavailable',
  unknown: 'Not checked',
};

type CopyState = 'confirmed' | 'confirmed-missing' | 'unreachable' | 'unchecked';

const COPY_STATE_LABEL: Record<CopyState, string> = {
  confirmed: '✅ Confirmed',
  'confirmed-missing': 'Confirmed missing',
  unreachable: '☒ Unreachable',
  unchecked: 'Not checked',
};

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}

type ServerCopyRow = { name: string; state: CopyState; url?: string };

/** One row per configured server, using only URLs the catalog already recorded
    (from a server listing or an event tag) - never a synthesized `${server}/${sha256}`,
    since not every server type addresses blobs that way (ADR-0006, NIP-96 servers). */
function serverCopyRows(
  sha256: string,
  urls: string[],
  servers: ServerInfo[],
  liveResults: Array<{ serverId: string; state: string; httpStatus?: number }> | undefined
): ServerCopyRow[] {
  return servers.map(server => {
    const matchedUrl = urls.find(url => sameHost(url, server.url));
    const live = liveResults?.find(result => result.serverId === server.url);
    if (live) {
      const state: CopyState =
        live.state === 'present' ? 'confirmed' : live.state === 'unreachable' ? 'unreachable' : 'confirmed-missing';
      return { name: server.name, state, url: state === 'confirmed' ? matchedUrl : undefined };
    }
    if (server.isLoading) return { name: server.name, state: 'unchecked' };
    if (server.isError) return { name: server.name, state: 'unreachable' };
    if (server.blobs) {
      const present = server.blobs.some(blob => blob.sha256 === sha256);
      return { name: server.name, state: present ? 'confirmed' : 'confirmed-missing', url: present ? matchedUrl : undefined };
    }
    return { name: server.name, state: 'unchecked' };
  });
}

/** URLs that came from a Nostr event tag rather than a configured server's own
    listing - shown separately so a confirmed server copy is never confused with
    an unverified external link (issue #23). */
function eventUrlsFor(urls: string[], servers: ServerInfo[]): string[] {
  return urls.filter(url => !servers.some(server => sameHost(url, server.url)));
}

type DetailReturnState = { timelineLocationKey?: string };

export default function TimelineAssetDetail() {
  const { user, signEventTemplate } = useNostr();
  const [reportOpen, setReportOpen] = useState(false);
  const { distribution, serverInfo } = useServerInfo();
  const { dispatch } = useGlobalContext();
  const knownServersFor = useCallback(
    (sha256: string | undefined) => (sha256 ? (distribution[sha256]?.servers ?? []) : []),
    [distribution]
  );
  const { assetId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<TimelineAssetDetailType>();
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);
  const [availableChecked, setAvailableChecked] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [serverResults, setServerResults] = useState<
    Record<string, Array<{ serverId: string; state: string; httpStatus?: number }>>
  >({});
  const [rawEventOpen, setRawEventOpen] = useState(false);
  const [detailAction, setDetailAction] = useState<'mirror' | 'sync' | 'delete'>();
  const availabilityStarted = useRef(false);

  const checkAvailability = useCallback(
    async (blobHashes: string[]) => {
      if (!user?.pubkey || !assetId || availabilityStarted.current) return;
      availabilityStarted.current = true;
      setCheckingAvailability(true);
      setServerResults({});
      const probe = async (server: { id: string; baseUrl: string }, sha256: string) => {
        const url = `${server.baseUrl}/${sha256}`;
        try {
          const response = await fetch(url, { method: 'HEAD' });
          return {
            status: response.status,
            size: response.status === 200 ? Number(response.headers.get('content-length') ?? 0) : undefined,
            mimeType: response.headers.get('content-type') ?? undefined,
          };
        } catch {
          return { status: 0 };
        }
      };
      try {
        await Promise.all([
          getCatalogClient().refreshReplicaAvailability(
            user.pubkey,
            probe,
            1_000_000,
            blobHashes,
            (sha256, serverId, state, httpStatus) => {
              setServerResults(prev => ({
                ...prev,
                [sha256]: [...(prev[sha256] ?? []), { serverId, state, httpStatus }],
              }));
            }
          ),
          getCatalogClient().refreshEventUrlAvailability(user.pubkey, probeNativeUrl, 1_000_000, blobHashes),
        ]);
      } catch {
        // Show whatever the catalog holds now; the check can run again next visit.
      }
      setCheckingAvailability(false);
      setAvailableChecked(true);
      getCatalogClient()
        .getCatalogTimelineAsset(user.pubkey, assetId)
        .then(result => {
          if (result) setDetail(result);
        })
        .catch(() => undefined);
    },
    [user?.pubkey, assetId]
  );

  useEffect(() => {
    if (!user?.pubkey || !assetId) return;
    let active = true;
    setState('loading');
    void getCatalogClient()
      .getCatalogTimelineAsset(user.pubkey, assetId)
      .then(result => {
        if (!active) return;
        setDetail(result);
        setState(result ? 'ready' : 'missing');
        // Auto-check availability for small assets; the check ends with a forced
        // reprojection so the header agrees with the per-blob states.
        if (result && result.blobs.length < 10) void checkAvailability(result.blobs.map(b => b.sha256));
      })
      .catch(() => {
        if (active) setState('failed');
      });
    return () => {
      active = false;
    };
  }, [assetId, user?.pubkey, loadAttempt, checkAvailability]);

  const returnToTimeline = () => {
    const timelineLocationKey = (location.state as DetailReturnState | null)?.timelineLocationKey;
    navigate('/browse', { state: timelineLocationKey ? { timelineLocationKey } : null });
  };

  const closeDetailAction = () => setDetailAction(undefined);
  const handleActionCompleted = () => {
    const completedAction = detailAction;
    setDetailAction(undefined);
    if (completedAction === 'delete') {
      navigate('/browse');
    } else {
      // Mirror/sync add copies without removing the item - refetch so the
      // header's replica count and availability agree with the new state.
      setLoadAttempt(attempt => attempt + 1);
    }
  };

  if (!user?.pubkey)
    return (
      <DetailMessage
        title="Sign in to open this item"
        detail="Item details are kept in your local catalog."
        onBack={returnToTimeline}
      />
    );
  if (state === 'loading')
    return (
      <DetailMessage
        title="Loading item details"
        detail="Reading your local catalog and how this media fits together."
        onBack={returnToTimeline}
        loading
      />
    );
  if (state === 'missing')
    return (
      <DetailMessage
        title="Item not found"
        detail="It may have been removed from this local catalog."
        onBack={returnToTimeline}
      />
    );
  if (state === 'failed' || !detail)
    return (
      <DetailMessage
        title="Item details unavailable"
        detail="Reading this item from your local catalog failed. Your data is intact."
        onBack={returnToTimeline}
        onRetry={() => setLoadAttempt(attempt => attempt + 1)}
      />
    );

  const { projection, blobs } = detail;
  const configuredServers = Object.values(serverInfo).filter(server => !server.virtual);
  const playAudio = () => {
    if (!projection.primaryUrl) return;
    dispatch({ type: 'SET_CURRENT_SONG', song: { url: projection.primaryUrl } });
  };
  // The kind-specific text body (a note's content, a video's description tag).
  // When the body is what the title was derived from - a note whose content
  // became the card title - it renders once, as body, not twice.
  const body = detail.event ? eventBody(detail.event) : undefined;
  const subtitle =
    body && (!projection.displaySubtitle || projection.displaySubtitle === body)
      ? undefined
      : projection.displaySubtitle;
  const titleHidden = body !== undefined && projection.displayTitle === body;
  const Icon = TYPE_ICON[projection.displayType];
  const dateLabel =
    projection.displayDateSource === 'event'
      ? 'Published'
      : projection.displayDateSource === 'blob-uploaded'
        ? 'Uploaded'
        : 'Discovered';
  const eventIdentifier = (() => {
    try {
      if (projection.eventAddress?.startsWith('naddr1') || projection.eventAddress?.startsWith('nevent1'))
        return projection.eventAddress;
      if (!projection.eventId || !projection.eventAuthor || projection.eventKind === undefined) return undefined;
      return nip19.neventEncode({
        id: projection.eventId,
        kind: projection.eventKind,
        author: projection.eventAuthor,
      });
    } catch {
      return undefined;
    }
  })();
  const authorNpub = (() => {
    try {
      return projection.eventAuthor ? nip19.npubEncode(projection.eventAuthor) : undefined;
    } catch {
      return undefined;
    }
  })();
  const shortAuthor = authorNpub ? `${authorNpub.slice(0, 12)}…${authorNpub.slice(-6)}` : undefined;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Button variant="outline" onClick={returnToTimeline} className="mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to timeline
      </Button>
      <header className="border-b-2 border-primary pb-5">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Nostr event</p>
        <div className="mt-3 flex flex-col gap-6 md:flex-row md:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-primary bg-primary/10">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {eventKindLabel(projection.eventKind)}
                  </p>
                  <h1
                    className={`truncate text-3xl font-black tracking-tight ${
                      projection.displayTitleIsFallback || titleHidden ? 'text-muted-foreground' : ''
                    }`}
                  >
                    {titleHidden ? eventKindLabel(projection.eventKind) : projection.displayTitle}
                  </h1>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {dateLabel} {formatDate(projection.displayDate)} ·{' '}
                    {AVAILABILITY_LABEL[projection.availabilityState]}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0" aria-label="Open item actions">
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setDetailAction('mirror')}>Mirror</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDetailAction('sync')}>Sync</DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setDetailAction('delete')}
                    >
                      Delete
                    </DropdownMenuItem>
                    {detail.event && (
                      <DropdownMenuItem onSelect={() => setRawEventOpen(true)}>
                        <Code2 className="mr-2 h-4 w-4" />
                        Raw event
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {projection.eventId ? (
              <>
                {(subtitle || body) && (
                  <>
                    <div className={`mt-5 max-w-2xl text-base leading-7 ${descExpanded ? '' : 'line-clamp-3'}`}>
                      {subtitle && <p>{subtitle}</p>}
                      {body && <NostrText text={body} />}
                    </div>
                    {(subtitle || body) && (subtitle?.length ?? 0) + (body?.length ?? 0) > 200 && (
                      <button
                        onClick={() => setDescExpanded(v => !v)}
                        className="mt-1 text-xs text-primary underline-offset-4 hover:underline"
                      >
                        {descExpanded ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </>
                )}
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs text-muted-foreground">
                  {shortAuthor && authorNpub && (
                    <button
                      type="button"
                      title={`Copy ${authorNpub}`}
                      onClick={() => void navigator.clipboard.writeText(authorNpub).catch(() => undefined)}
                      className="select-all underline-offset-4 hover:text-foreground hover:underline"
                    >
                      AUTHOR · {shortAuthor}
                    </button>
                  )}
                  {eventIdentifier && (
                    <a
                      href={`https://nostr.at/${eventIdentifier}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 uppercase text-primary underline-offset-4 hover:underline"
                    >
                      Open elsewhere <ExternalLink className="h-3 w-3" aria-label="Opens in a new tab" />
                    </a>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-5 max-w-2xl border bg-muted/30 p-4 shadow-[3px_3px_0_hsl(var(--border))]">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Unlinked file</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  This file is in your local catalog but is not linked to a Nostr event. Its storage and availability
                  details remain available below.
                </p>
              </div>
            )}
            {blobs.length >= 10 && !availableChecked && (
              <Button
                size="sm"
                variant="outline"
                disabled={checkingAvailability}
                onClick={() => void checkAvailability(blobs.map(b => b.sha256))}
                className="mt-5"
              >
                {checkingAvailability ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Check availability (
                {blobs.length} blobs)
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setReportOpen(true)} className="mt-5">
              <Flag className="mr-1 h-4 w-4" />
              Report
            </Button>
            {availableChecked && <p className="mt-3 text-xs text-muted-foreground">Availability checked</p>}
          </div>
          <div className="shrink-0 md:w-96">
            <MediaPreview projection={projection} knownServersFor={knownServersFor} onPlayAudio={playAudio} />
          </div>
        </div>
      </header>

      <section className="mt-8" aria-labelledby="attached-blobs-heading">
        <div className="flex items-end justify-between gap-4 border-b pb-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Supporting technical detail
            </p>
            <h2 id="attached-blobs-heading" className="mt-1 text-2xl font-bold">
              File details
            </h2>
          </div>
          <p className="font-mono text-xs text-muted-foreground">{blobs.length} total</p>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <DetailStat label="Attached files" value={`${projection.blobCount}`} />
          <DetailStat label="Total size" value={formatFileSize(projection.totalBlobSize)} />
          <DetailStat label="Available copies" value={`${projection.replicaCount}`} />
        </dl>
        {projection.unknownBlobSizeCount > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Size is unknown for {projection.unknownBlobSizeCount} attached blob
            {projection.unknownBlobSizeCount === 1 ? '' : 's'}.
          </p>
        )}
        <ul className="mt-4 space-y-3">
          {blobs.map(blob => {
            const copyRows = serverCopyRows(blob.sha256, blob.urls, configuredServers, serverResults[blob.sha256]);
            const eventUrls = eventUrlsFor(blob.urls, configuredServers);
            return (
              <li
                key={`${blob.sha256}:${blob.role}:${blob.ordinal}`}
                className="border bg-card p-4 shadow-[3px_3px_0_hsl(var(--border))]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{blob.role}</p>
                    <p className="mt-1 truncate font-mono text-sm">{blob.sha256}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {checkingAvailability && serverResults[blob.sha256]?.length ? (
                      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
                    ) : null}
                    <span className="font-mono text-xs uppercase text-muted-foreground">
                      {AVAILABILITY_LABEL[blob.availabilityState]}
                    </span>
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                  <DetailStat
                    label="MIME type"
                    value={
                      projection.displayType === 'video' && blob.eventMimeType
                        ? blob.eventMimeType
                        : (blob.mimeType ?? 'Unknown')
                    }
                  />
                  <DetailStat label="Size" value={blob.size !== undefined ? formatFileSize(blob.size) : 'Unknown'} />
                  <DetailStat label="Copies" value={`${blob.replicaCount}`} />
                  {blob.dimensions && <DetailStat label="Dimensions" value={blob.dimensions} />}
                </dl>
                {configuredServers.length > 0 && (
                  <div className="mt-4 border-t pt-3">
                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Server copies
                    </p>
                    <ul className="mt-2 space-y-1">
                      {copyRows.map(row => (
                        <li key={row.name} className="flex items-center justify-between gap-2 text-sm">
                          {row.url ? (
                            <a
                              href={row.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline-offset-4 hover:underline"
                            >
                              {row.name}
                            </a>
                          ) : (
                            <span>{row.name}</span>
                          )}
                          <span className="font-mono text-xs uppercase text-muted-foreground">
                            {COPY_STATE_LABEL[row.state]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {eventUrls.length > 0 && (
                  <div className="mt-4 border-t pt-3">
                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      From event metadata
                    </p>
                    <ul className="mt-2 space-y-1">
                      {eventUrls.map(url => (
                        <li key={url}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-full items-center gap-1 break-all text-sm text-primary underline-offset-4 hover:underline"
                          >
                            <span>{url}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" aria-label="Opens in a new tab" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      {detail.event && (
        <Dialog open={rawEventOpen} onOpenChange={setRawEventOpen}>
          <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
            <DialogHeader className="border-b px-6 py-5">
              <DialogTitle>Raw event</DialogTitle>
              <DialogDescription>The native Nostr event stored in your local catalog.</DialogDescription>
            </DialogHeader>
            <pre className="min-h-0 overflow-auto bg-muted/30 px-6 py-5 font-mono text-xs leading-5 text-foreground">
              {rawEventOpen ? JSON.stringify(detail.event, null, 2) : null}
            </pre>
          </DialogContent>
        </Dialog>
      )}
      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        hashes={blobs.map(b => b.sha256)}
        event={detail.event ? { id: detail.event.id, pubkey: detail.event.pubkey } : undefined}
        signEventTemplate={signEventTemplate}
      />
      {detailAction && user?.pubkey && (
        <BrowseActionPlanDialog
          open
          action={detailAction}
          assets={[projection]}
          pubkey={user.pubkey}
          serverInfo={serverInfo}
          signEventTemplate={signEventTemplate}
          onClose={closeDetailAction}
          onDeleted={handleActionCompleted}
        />
      )}
    </main>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

/** The direct, playable media for this item - not the proxied static thumbnail
    used on cards - so images read at real size and audio/video are interactive
    in place instead of forcing a raw link open in a new tab (issue #24). */
function MediaPreview({
  projection,
  knownServersFor,
  onPlayAudio,
}: {
  projection: TimelineAssetDetailType['projection'];
  knownServersFor: KnownServersFor;
  onPlayAudio: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const url = projection.primaryUrl;
  if (!url) {
    return (
      <div className="flex aspect-video items-center justify-center border bg-muted/30 text-sm text-muted-foreground">
        Media unavailable
      </div>
    );
  }
  if (projection.displayType === 'image' && !failed) {
    return (
      <img
        src={url}
        alt={projection.displayTitle}
        onError={() => setFailed(true)}
        className="max-h-[70vh] w-full border object-contain"
      />
    );
  }
  if (projection.displayType === 'video' && !failed) {
    return (
      <video src={url} controls onError={() => setFailed(true)} className="max-h-[70vh] w-full border bg-black" />
    );
  }
  if (projection.displayType === 'audio') {
    return (
      <Button onClick={onPlayAudio} size="lg" className="w-full">
        <Play className="mr-2 h-5 w-5" />
        Play
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <TimelineThumbnail item={projection} knownServersFor={knownServersFor} />
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center justify-center gap-1 border px-3 py-2 text-sm text-primary underline-offset-4 hover:underline"
      >
        Open externally <ExternalLink className="h-3 w-3" aria-label="Opens in a new tab" />
      </a>
    </div>
  );
}

function DetailMessage({
  title,
  detail,
  onBack,
  loading = false,
  onRetry,
}: {
  title: string;
  detail: string;
  onBack: () => void;
  loading?: boolean;
  onRetry?: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[55vh] max-w-2xl flex-col justify-center px-6">
      {loading && <Loader2 className="mb-4 h-6 w-6 animate-spin text-primary" />}
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Item details</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">{title}</h1>
      <p className="mt-3 text-muted-foreground">{detail}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back to timeline
        </Button>
        {onRetry && <Button onClick={onRetry}>Try again</Button>}
      </div>
    </main>
  );
}
