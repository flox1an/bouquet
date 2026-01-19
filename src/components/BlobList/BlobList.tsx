import { useState, useMemo, useEffect } from 'react';
import { BlobDescriptor } from 'blossom-client-sdk';
import {
  Clipboard,
  AlertTriangle,
  Folder,
  FolderPlus,
  Plus,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { formatFileSize, formatDate } from '../../utils/utils';
import ImageBlobList from '../ImageBlobList/ImageBlobList';
import VideoBlobList from '../VideoBlobList/VideoBlobList';
import AudioBlobList from '../AudioBlobList/AudioBlobList';
import DocumentBlobList from '../DocumentBlobList/DocumentBlobList';
import { useServerInfo } from '../../utils/useServerInfo';
import Badge from './Badge';
import BlobListTypeMenu, { ListMode } from './BlobListTypeMenu';
import useFileMetaEventsByHash from '../../utils/useFileMetaEvents';
import './BlobList.css';
import { useBlobSelection } from './useBlobSelection';
import MimeTypeIcon from '../MimeTypeIcon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type BlobListProps = {
  blobs: BlobDescriptor[];
  onDelete?: (blobs: BlobDescriptor[]) => void;
  title?: string;
  className?: string;
};

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

const BlobList = ({ blobs, onDelete, title, className = '' }: BlobListProps) => {
  const [mode, setMode] = useState<ListMode>('list');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const { distribution } = useServerInfo();
  const fileMetaEventsByHash = useFileMetaEventsByHash();
  const { handleSelectBlob, selectedBlobs, setSelectedBlobs } = useBlobSelection(blobs);

  // Reset to page 1 when blobs change (e.g., switching servers)
  useEffect(() => {
    setCurrentPage(1);
  }, [blobs]);

  // Pagination calculations
  const totalPages = Math.ceil(blobs.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedBlobs = useMemo(() => blobs.slice(startIndex, endIndex), [blobs, startIndex, endIndex]);

  // Reset to page 1 when blobs change or page size changes
  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(1);
  };

  const images = useMemo(
    () => blobs.filter(b => b.type?.startsWith('image/')).sort((a, b) => (a.uploaded > b.uploaded ? -1 : 1)), // descending
    [blobs]
  );

  const videos = useMemo(
    () => blobs.filter(b => b.type?.startsWith('video/')).sort((a, b) => (a.uploaded > b.uploaded ? -1 : 1)), // descending
    [blobs]
  );

  const audioFiles = useMemo(
    () => blobs.filter(b => b.type?.startsWith('audio/')).sort((a, b) => (a.uploaded > b.uploaded ? -1 : 1)),
    [blobs]
  );

  const docs = useMemo(
    () => blobs.filter(b => b.type?.startsWith('application/pdf')).sort((a, b) => (a.uploaded > b.uploaded ? -1 : 1)), // descending
    [blobs]
  );

  const Actions = ({ blob }: { blob: BlobDescriptor }) => (
    <Button
      variant="ghost"
      size="sm"
      title="Copy link to clipboard"
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(blob.url);
      }}
    >
      <Clipboard className="h-4 w-4" />
    </Button>
  );

  const Badges = ({ blob }: { blob: BlobDescriptor }) => {
    const events = fileMetaEventsByHash[blob.sha256];
    if (!events) return null;

    return events.map(ev => <Badge ev={ev} key={ev.id}></Badge>);
  };

  const selectedCount = useMemo(() => Object.values(selectedBlobs).filter(v => v).length, [selectedBlobs]);

  const addSelectedBlobsToCollection = (collectionName: string) => {
    // TODO store collections in DB
    console.log('Add to collection', collectionName, selectedBlobs);
  };

  const createNewCollection = () => {
    // TODO Show new collection dialog
    console.log('Show new collection dialog');
  };

  return (
    <>
      <div className={`blob-list-header ${className} ${!title ? 'justify-end' : ''}`}>
        {title && <h2>{title}</h2>}

        {selectedCount > 0 && (
          <div className="flex bg-muted rounded-lg gap-2 mr-2 py-2 px-8 align-middle items-center">
            {selectedCount} blobs selected
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="flex whitespace-nowrap" title="Add selected blobs to collection">
                  <Plus className="h-4 w-4" />
                  <Folder className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[30em]">
                <DropdownMenuItem onClick={() => addSelectedBlobsToCollection('Collection 1')}>
                  <Folder className="h-4 w-4 mr-2" /> Collection 1 (NOT IMPLEMENTED YET)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addSelectedBlobsToCollection('Collection 2')}>
                  <Folder className="h-4 w-4 mr-2" /> Collection 2 (NOT IMPLEMENTED YET)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => createNewCollection()}>
                  <FolderPlus className="h-4 w-4 mr-2" /> new collection (NOT IMPLEMENTED YET)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {onDelete && (
              <Button
                size="sm"
                onClick={async () => {
                  await onDelete(blobs.filter(b => selectedBlobs[b.sha256]));
                  setSelectedBlobs({});
                }}
                title="Delete the selected blobs"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setSelectedBlobs({})}>
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        )}
        <BlobListTypeMenu
          mode={mode}
          setMode={setMode}
          hasImages={images.length > 0}
          hasVideo={videos.length > 0}
          hasAudio={audioFiles.length > 0}
          hasDocs={docs.length > 0}
        />
      </div>

      {mode === 'gallery' && (
        <ImageBlobList images={images} selectedBlobs={selectedBlobs} handleSelectBlob={handleSelectBlob} />
      )}

      {mode === 'video' && (
        <VideoBlobList videos={videos} selectedBlobs={selectedBlobs} handleSelectBlob={handleSelectBlob} />
      )}

      {mode === 'audio' && (
        <AudioBlobList audioFiles={audioFiles} selectedBlobs={selectedBlobs} handleSelectBlob={handleSelectBlob} />
      )}

      {mode === 'docs' && <DocumentBlobList docs={docs} />}

      {mode === 'list' && (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Hash</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedBlobs.map(blob => (
                  <TableRow
                    key={blob.sha256}
                    data-state={selectedBlobs[blob.sha256 ? blob.sha256 : blob.url] ? 'selected' : undefined}
                    className="cursor-pointer"
                    onClick={e => handleSelectBlob(blob.sha256 ? blob.sha256 : blob.url, e)}
                  >
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={!!selectedBlobs[blob.sha256 ? blob.sha256 : blob.url]}
                          onCheckedChange={() => handleSelectBlob(blob.sha256 ? blob.sha256 : blob.url)}
                          onClick={e => e.stopPropagation()}
                        />
                        <MimeTypeIcon type={blob.type} />
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <a className="text-primary hover:underline" href={blob.url} target="_blank">
                        {blob.sha256 ? blob.sha256.slice(0, 15) : blob.url.slice(blob.url.length - 15)}
                      </a>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badges blob={blob} />
                        {distribution[blob.sha256]?.servers.length === 1 && (
                          <span className="text-yellow-500" title="Not distributed to any other server">
                            <AlertTriangle className="h-4 w-4" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs md:text-sm">{formatFileSize(blob.size)}</TableCell>
                    <TableCell className="text-xs md:text-sm">{formatDate(blob.uploaded)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Actions blob={blob} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between px-2 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Show</span>
              <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map(size => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>per page</span>
            </div>

            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span>
                {startIndex + 1}-{Math.min(endIndex, blobs.length)} of {blobs.length}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                title="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                title="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-sm">
                Page {currentPage} of {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                title="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
                title="Last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default BlobList;
