import { useState } from 'react';
import type { BlobDescriptor } from 'blossom-client-sdk';
import { AlertTriangle, Boxes, Calendar, CheckSquare, ChevronDown, ChevronRight, ExternalLink, FileQuestion, GitBranch, Hash, Loader2, Server } from 'lucide-react';
import MimeTypeIcon from '../MimeTypeIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDate, formatFileSize } from '../../utils/utils';
import {
  getActionEligibility,
  type BlobGraphEdge,
  type BlobGraphNode,
  type BlobRelationshipGraph,
  type EventNode,
  type PlaylistNode,
  type UnknownBucket,
} from '../../utils/blobRelationshipGraph';
import type { HandleSelectBlobType } from './useBlobSelection';

type RelationshipTreeProps = {
  graph: BlobRelationshipGraph;
  loading: boolean;
  relaysReady: boolean;
  playlistFetches: number;
  distribution: Record<string, { blob: BlobDescriptor; servers: string[] }>;
  serverInfo: Record<string, { url: string; name: string }>;
  selectedBlobs: Record<string, boolean>;
  handleSelectBlob: HandleSelectBlobType;
  onSelectGroup: (ids: string[]) => void;
};

const ROOT_KIND_LABELS: Record<number, string> = {
  1: 'Post',
  20: 'Picture',
  21: 'Video',
  22: 'Vertical video',
  1063: 'File metadata',
  30563: 'Drive',
  31337: 'Audio',
  34235: 'Video',
  34236: 'Vertical video',
};

const BUCKET_LABELS: Record<UnknownBucket['id'], string> = {
  unreferenced: 'Unreferenced',
  ambiguous: 'Ambiguous',
  'parse-failed': 'Parse failed',
  'external-only': 'External only',
};

// Only traverse structural edges in the tree. blob-matches-* are provenance
// lookup edges stored for query purposes — traversing them would re-render
// the same blob node a second time under the same parent.
const STRUCTURAL_EDGE_KINDS = new Set([
  'event-references-blob',
  'event-references-playlist',
  'playlist-references-playlist',
  'playlist-references-segment',
]);

export default function RelationshipTree({
  graph,
  loading,
  relaysReady,
  playlistFetches,
  distribution,
  serverInfo,
  selectedBlobs,
  handleSelectBlob,
  onSelectGroup,
}: RelationshipTreeProps) {
  const childEdgesByParent = indexEdgesByParent(graph.edges);
  const meaningfulBuckets = Object.values(graph.unknownBuckets).filter(bucket => bucket.items.length > 0);

  // Filter event roots that have no matched local blobs — they add no actionable
  // information since we can't operate on events without blobs.
  const visibleRoots = graph.roots.filter(root => {
    if (root.kind === 'playlist') return true;
    const localBlobs = collectLocalBlobIds(root.id, graph, childEdgesByParent);
    return localBlobs.length > 0;
  });

  const rootCount = visibleRoots.length + (meaningfulBuckets.length > 0 ? 1 : 0);
  const [collapsedRoots, setCollapsedRoots] = useState<Record<string, boolean>>({});

  const toggleRoot = (id: string) => setCollapsedRoots(prev => ({ ...prev, [id]: !prev[id] }));

  if (!relaysReady) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Relationships are waiting for active profile relays.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        <GitBranch className="h-4 w-4" />
        <span>{rootCount} roots</span>
        <span>·</span>
        <span>{visibleRoots.filter(r => r.kind === 'event').length} events</span>
        {playlistFetches > 0 && (
          <>
            <span>·</span>
            <span>{playlistFetches} playlist fetches</span>
          </>
        )}
        {loading && (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating graph
          </span>
        )}
      </div>

      {visibleRoots.map(root => (
        <RootCard
          key={root.id}
          root={root}
          collapsed={!!collapsedRoots[root.id]}
          onToggle={() => toggleRoot(root.id)}
          graph={graph}
          childEdgesByParent={childEdgesByParent}
          distribution={distribution}
          serverInfo={serverInfo}
          selectedBlobs={selectedBlobs}
          handleSelectBlob={handleSelectBlob}
          onSelectGroup={onSelectGroup}
        />
      ))}

      {meaningfulBuckets.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileQuestion className="h-4 w-4" /> Unknown
            </CardTitle>
            <CardDescription>Inspect-only buckets for blobs or references without a safe single parent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {meaningfulBuckets.map(bucket => (
              <div key={bucket.id} className="rounded-lg border bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="font-medium">{BUCKET_LABELS[bucket.id]}</div>
                  <Badge variant="outline">{bucket.items.length}</Badge>
                </div>
                <div className="space-y-1">
                  {bucket.items.map(item => (
                    <TreeRow
                      key={`${bucket.id}:${item.id}`}
                      node={item}
                      depth={0}
                      graph={graph}
                      childEdgesByParent={childEdgesByParent}
                      distribution={distribution}
                      serverInfo={serverInfo}
                      selectedBlobs={selectedBlobs}
                      handleSelectBlob={handleSelectBlob}
                      inspectOnly
                    />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type RootCardProps = {
  root: EventNode | PlaylistNode;
  collapsed: boolean;
  onToggle: () => void;
  graph: BlobRelationshipGraph;
  childEdgesByParent: Map<string, BlobGraphEdge[]>;
  distribution: RelationshipTreeProps['distribution'];
  serverInfo: RelationshipTreeProps['serverInfo'];
  selectedBlobs: RelationshipTreeProps['selectedBlobs'];
  handleSelectBlob: HandleSelectBlobType;
  onSelectGroup: (ids: string[]) => void;
};

function RootCard({ root, collapsed, onToggle, graph, childEdgesByParent, distribution, serverInfo, selectedBlobs, handleSelectBlob, onSelectGroup }: RootCardProps) {
  const localBlobIds = collectLocalBlobIds(root.id, graph, childEdgesByParent);
  const eligibility = getActionEligibility(graph, localBlobIds, 'delete');
  const directEdges = childEdgesByParent.get(root.id) ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button
            className="flex min-w-0 flex-1 items-start gap-2 text-left"
            onClick={onToggle}
            aria-expanded={!collapsed}
          >
            <span className="mt-0.5 shrink-0 text-muted-foreground">
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                {root.kind === 'event' ? <Hash className="h-4 w-4" /> : <GitBranch className="h-4 w-4" />}
                {root.kind === 'event' ? root.title || shortId(root.eventId) : shortUrl(root.url)}
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                {root.kind === 'event' ? (
                  <>
                    <Badge variant="outline">{ROOT_KIND_LABELS[root.eventKind] ?? `Kind ${root.eventKind}`}</Badge>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" /> {formatDate(root.createdAt)}
                    </span>
                    <span className="font-mono">{shortId(root.eventId)}</span>
                  </>
                ) : (
                  <>
                    <Badge variant={root.parseState === 'parsed' ? 'secondary' : 'outline'}>{root.parseState}</Badge>
                    <span className="break-all font-mono">{root.sha256 ? shortId(root.sha256) : root.url}</span>
                  </>
                )}
              </CardDescription>
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline">{localBlobIds.length} local</Badge>
            <Badge variant="outline">{directEdges.length} direct</Badge>
            <Button
              size="sm"
              variant="outline"
              disabled={!eligibility.enabled}
              onClick={() => onSelectGroup(localBlobIds)}
              title={eligibility.reason}
            >
              <CheckSquare className="mr-1 h-3.5 w-3.5" /> Select group
            </Button>
          </div>
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent className="space-y-1">
          {directEdges.map(edge => (
            <TreeRow
              key={`${edge.from}:${edge.to}:${edge.kind}`}
              node={graph.nodes[edge.to]}
              depth={0}
              graph={graph}
              edge={edge}
              childEdgesByParent={childEdgesByParent}
              distribution={distribution}
              serverInfo={serverInfo}
              selectedBlobs={selectedBlobs}
              handleSelectBlob={handleSelectBlob}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

type TreeRowProps = {
  node: BlobGraphNode | undefined;
  depth: number;
  graph: BlobRelationshipGraph;
  childEdgesByParent: Map<string, BlobGraphEdge[]>;
  distribution: RelationshipTreeProps['distribution'];
  serverInfo: RelationshipTreeProps['serverInfo'];
  selectedBlobs: RelationshipTreeProps['selectedBlobs'];
  handleSelectBlob: HandleSelectBlobType;
  edge?: BlobGraphEdge;
  inspectOnly?: boolean;
};

function TreeRow({ node, depth, graph, childEdgesByParent, distribution, serverInfo, selectedBlobs, handleSelectBlob, edge, inspectOnly }: TreeRowProps) {
  // Rows with children default to expanded at depth 0, collapsed deeper.
  const [expanded, setExpanded] = useState(depth === 0);

  if (!node) return null;
  const graphChildren = childEdgesByParent.get(node.id) ?? [];
  const blob = node.kind === 'blob' ? node : undefined;
  const servers = blob?.sha256 ? (distribution[blob.sha256]?.servers ?? []) : [];
  const hasChildren = graphChildren.length > 0 || servers.length > 0;
  const selectionKey = blob?.sha256 ?? blob?.url;
  const distributionWarning = servers.length === 1;
  const isVideo = blob?.mimeType?.startsWith('video/');

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
        style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
      >
        {/* Expand toggle or spacer */}
        <button
          className="w-4 shrink-0"
          onClick={() => hasChildren && setExpanded(e => !e)}
          aria-expanded={hasChildren ? expanded : undefined}
          tabIndex={hasChildren ? 0 : -1}
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          ) : null}
        </button>

        {/* Blob checkbox */}
        <div className="w-5 shrink-0">
          {blob && !inspectOnly ? (
            <Checkbox
              checked={!!selectedBlobs[selectionKey ?? '']}
              onCheckedChange={() => selectionKey && handleSelectBlob(selectionKey)}
              aria-label="Select blob"
            />
          ) : null}
        </div>

        <NodeIcon node={node} />

        <div className="min-w-0 flex-1 truncate">
          <a className="font-mono text-xs text-primary hover:underline" href={nodeUrl(node)} target="_blank" rel="noreferrer">
            {nodeLabel(node)}
          </a>
        </div>

        {/* Size */}
        {blob?.size !== undefined && (
          <span className="shrink-0 tabular-nums text-muted-foreground">{formatFileSize(blob.size)}</span>
        )}

        {/* Dimensions (from event imeta dim tag) */}
        {blob?.dimensions && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{blob.dimensions}</span>
        )}

        {/* MIME / codec for videos */}
        {isVideo && blob?.mimeType && (
          <Badge variant="outline" className="shrink-0 font-mono text-xs">
            {blob.mimeType.replace('video/', '')}
          </Badge>
        )}

        {distributionWarning && (
          <span className="shrink-0 text-yellow-500" title="Not distributed to any other server">
            <AlertTriangle className="h-4 w-4" />
          </span>
        )}

        {/* Provenance badges */}
        {edge?.provenance.match && <Badge variant="outline" className="shrink-0">{edge.provenance.match}</Badge>}
        {node.kind === 'playlist' && <Badge variant="outline" className="shrink-0">{node.parseState}</Badge>}
      </div>

      {expanded && (
        <>
          {graphChildren.map(childEdge => (
            <TreeRow
              key={`${childEdge.from}:${childEdge.to}:${childEdge.kind}`}
              node={graph.nodes[childEdge.to]}
              depth={depth + 1}
              graph={graph}
              edge={childEdge}
              childEdgesByParent={childEdgesByParent}
              distribution={distribution}
              serverInfo={serverInfo}
              selectedBlobs={selectedBlobs}
              handleSelectBlob={handleSelectBlob}
              inspectOnly={inspectOnly}
            />
          ))}
          {blob && servers.map(serverName => (
            <div
              key={serverName}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50"
              style={{ paddingLeft: `${(depth + 1) * 1.25 + 0.5 + 1.5}rem` }}
            >
              <Server className="h-3 w-3 shrink-0" />
              <a
                href={serverInfo[serverName] ? `${serverInfo[serverName].url}/${blob.sha256}` : blob.url}
                target="_blank"
                rel="noreferrer"
                className="truncate hover:underline"
              >
                {serverName}
              </a>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function NodeIcon({ node }: { node: BlobGraphNode }) {
  if (node.kind === 'blob') return <MimeTypeIcon type={node.mimeType} />;
  if (node.kind === 'external') return <ExternalLink className="h-4 w-4 text-muted-foreground" />;
  if (node.kind === 'segment') return <Boxes className="h-4 w-4 text-muted-foreground" />;
  if (node.kind === 'playlist') return <GitBranch className="h-4 w-4 text-muted-foreground" />;
  return <FileQuestion className="h-4 w-4 text-muted-foreground" />;
}

// Only index structural edges — blob-matches-* are provenance edges for query
// purposes and must not be traversed as tree children (causes duplicate rows).
function indexEdgesByParent(edges: BlobGraphEdge[]): Map<string, BlobGraphEdge[]> {
  const indexed = new Map<string, BlobGraphEdge[]>();
  for (const edge of edges) {
    if (!STRUCTURAL_EDGE_KINDS.has(edge.kind)) continue;
    const existing = indexed.get(edge.from);
    if (existing) existing.push(edge);
    else indexed.set(edge.from, [edge]);
  }
  return indexed;
}

function collectLocalBlobIds(rootId: string, graph: BlobRelationshipGraph, childEdgesByParent: Map<string, BlobGraphEdge[]>): string[] {
  const selected = new Set<string>();
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const node = graph.nodes[id];
    if (node?.kind === 'blob') selected.add(node.id);
    for (const childEdge of childEdgesByParent.get(id) ?? []) stack.push(childEdge.to);
  }
  return [...selected];
}

function nodeUrl(node: BlobGraphNode): string | undefined {
  if (node.kind === 'blob' || node.kind === 'playlist' || node.kind === 'segment' || node.kind === 'external') return node.url;
  return undefined;
}

function nodeLabel(node: BlobGraphNode): string {
  if (node.kind === 'blob') return node.sha256 ? shortId(node.sha256) : shortUrl(node.url);
  if (node.kind === 'playlist') return node.sha256 ? shortId(node.sha256) : shortUrl(node.url);
  if (node.kind === 'segment') return shortUrl(node.url);
  if (node.kind === 'external') return shortUrl(node.url);
  return node.id;
}

function shortId(value: string): string {
  return value.length > 16 ? `${value.slice(0, 12)}…${value.slice(-4)}` : value;
}

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}
