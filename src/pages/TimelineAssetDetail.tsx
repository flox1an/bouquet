import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Code2, ExternalLink, FileText, Image, Loader2, MoreVertical, Music2, Video } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { nip19 } from 'nostr-tools';
import { getCatalogClient } from '../catalog/catalogClient';
import type { TimelineAssetDetail as TimelineAssetDetailType } from '../catalog/advanced';
import { AudioTimelinePreview } from '../components/AudioTimelinePreview';
import { TimelineThumbnail } from '../components/TimelineThumbnail';
import { useNostr } from '../utils/nostr';
import { useServerInfo } from '../utils/useServerInfo';
import { formatDate, formatFileSize } from '../utils/utils';
import { probeNativeUrl } from '../catalog/availabilityFetch';
import { eventKindLabel } from '../catalog/eventKinds';

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

type DetailReturnState = { timelineLocationKey?: string };

export default function TimelineAssetDetail() {
  const { user } = useNostr();
  const { distribution } = useServerInfo();
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

  const checkAvailability = useCallback(async () => {
    if (!user?.pubkey || !assetId) return;
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
    const blobHashes = detail?.blobs?.map(b => b.sha256);
    if (!blobHashes || blobHashes.length === 0) {
      setCheckingAvailability(false);
      return;
    }
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
    ]).catch(() => undefined);
    setCheckingAvailability(false);
    setAvailableChecked(true);
    if (assetId)
      getCatalogClient()
        .getCatalogTimelineAsset(user.pubkey, assetId)
        .then(result => {
          if (result) setDetail(result);
        })
        .catch(() => undefined);
  }, [user?.pubkey, assetId, detail?.blobs]);

  useEffect(() => {
    if (!user?.pubkey || !assetId) return;
    let active = true;
    setState('loading');
    void getCatalogClient()
      .reprojectEvents(user.pubkey)
      .then(() => getCatalogClient().getCatalogTimelineAsset(user.pubkey, assetId))
      .then(async result => {
        if (result) return result;
        await getCatalogClient().projectCatalogAssets(user.pubkey);
        return getCatalogClient().getCatalogTimelineAsset(user.pubkey, assetId);
      })
      .then(result => {
        if (!active) return;
        setDetail(result);
        setState(result ? 'ready' : 'missing');
        // Auto-check availability for assets with <10 blobs
        if (
          result &&
          result.blobs.length < 10 &&
          user?.pubkey &&
          assetId &&
          !availableChecked &&
          !checkingAvailability
        ) {
          const blobHashes = result.blobs.map(b => b.sha256);
          setCheckingAvailability(true);
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
          Promise.all([
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
          ])
            .then(() => {
              if (!active) return;
              setCheckingAvailability(false);
              setAvailableChecked(true);
              if (assetId)
                getCatalogClient()
                  .getCatalogTimelineAsset(user.pubkey, assetId)
                  .then(r => {
                    if (r && active) setDetail(r);
                  })
                  .catch(() => undefined);
            })
            .catch(() => {
              if (active) setCheckingAvailability(false);
            });
        }
      })
      .catch(() => {
        if (active) setState('failed');
      });
    return () => {
      active = false;
    };
  }, [assetId, user?.pubkey, loadAttempt]);

  const returnToTimeline = () => {
    const timelineLocationKey = (location.state as DetailReturnState | null)?.timelineLocationKey;
    navigate('/browse', { state: timelineLocationKey ? { timelineLocationKey } : null });
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
                      projection.displayTitleIsFallback ? 'text-muted-foreground' : ''
                    }`}
                  >
                    {projection.displayTitle}
                  </h1>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {dateLabel} {formatDate(projection.displayDate)} ·{' '}
                    {AVAILABILITY_LABEL[projection.availabilityState]}
                  </p>
                </div>
                {detail.event && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0" aria-label="Open event actions">
                        <MoreVertical className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setRawEventOpen(true)}>
                        <Code2 className="mr-2 h-4 w-4" />
                        Raw event
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
            {projection.eventId ? (
              <>
                {projection.displaySubtitle && (
                  <>
                    <p className={`mt-5 max-w-2xl text-base leading-7 ${descExpanded ? '' : 'line-clamp-3'}`}>
                      {projection.displaySubtitle}
                    </p>
                    <button
                      onClick={() => setDescExpanded(v => !v)}
                      className="mt-1 text-xs text-primary underline-offset-4 hover:underline"
                    >
                      {descExpanded ? 'Show less' : 'Show more'}
                    </button>
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
                onClick={() => void checkAvailability()}
                className="mt-5"
              >
                {checkingAvailability ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Check availability (
                {blobs.length} blobs)
              </Button>
            )}
            {availableChecked && <p className="mt-3 text-xs text-muted-foreground">Availability checked</p>}
          </div>
          <div className="shrink-0 md:w-72">
            {projection.displayType === 'audio' ? (
              <AudioTimelinePreview item={projection} />
            ) : (
              <TimelineThumbnail item={projection} knownServersFor={knownServersFor} />
            )}
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
          {blobs.map(blob => (
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
                  {AVAILABILITY_LABEL[blob.availabilityState] === '✅ Available' && serverResults[blob.sha256] ? (
                    <TooltipProvider>
                      <Tooltip delayDuration={150}>
                        <TooltipTrigger asChild>
                          <span className="cursor-pointer font-mono text-xs uppercase text-muted-foreground">
                            {AVAILABILITY_LABEL[blob.availabilityState]}{' '}
                            {serverResults[blob.sha256]!.length > 0
                              ? `(${serverResults[blob.sha256]!.filter(r => r.state === 'present').length}/${serverResults[blob.sha256]!.length})`
                              : ''}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="left"
                          className="max-w-64 border bg-popover text-popover-foreground text-xs shadow-md"
                        >
                          <p className="mb-1 font-semibold">Server responses</p>
                          {serverResults[blob.sha256]!.map(result => (
                            <p
                              key={result.serverId}
                              className={result.state === 'present' ? 'text-green-600' : 'text-muted-foreground'}
                            >
                              {result.serverId.slice(0, 24)}… —{' '}
                              {result.state === 'present'
                                ? `✅ ${result.httpStatus ?? 200}`
                                : result.state === 'unreachable'
                                  ? '☒ unreachable'
                                  : result.state}
                            </p>
                          ))}
                          {serverResults[blob.sha256]!.length === 0 && (
                            <p className="text-muted-foreground">No servers checked yet</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <span className="font-mono text-xs uppercase text-muted-foreground">
                      {AVAILABILITY_LABEL[blob.availabilityState]}
                    </span>
                  )}
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
              {blob.urls.length > 0 && (
                <div className="mt-4 border-t pt-3">
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Known locations</p>
                  <ul className="mt-2 space-y-1">
                    {blob.urls.map(url => (
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
          ))}
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
