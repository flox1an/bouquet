import { ArrowUpOnSquareIcon, ExclamationTriangleIcon, ServerIcon, TrashIcon } from '@heroicons/react/24/outline';
import React, { ChangeEvent, DragEvent, useMemo, useRef } from 'react';
import CheckBox from './CheckBox/CheckBox';
import { Server } from '../utils/useUserServers';
import { formatFileSize } from '../utils/utils';
import { useServerInfo } from '../utils/useServerInfo';

type ResizeOptionType = {
  name: string;
  format?: string;
  width?: number;
  height?: number;
};

export const ResizeOptions: ResizeOptionType[] = [
  {
    name: 'Orignal Image',
    width: undefined,
    height: undefined,
  },
  {
    name: 'max. 1080x1080 pixels',
    width: 1080,
    height: 1080,
  },
  {
    name: 'max. 2048x2048 pixels',
    width: 2048,
    height: 2048,
  },
];

export type TransferStats = {
  enabled: boolean;
  size: number;
  transferred: number;
  rate: number;
  error?: string;
};

type UploadFileSelectionProps = {
  uploadBusy: boolean;
  servers: Server[];
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  clearTransfers: () => void;
  cleanPrivateData: boolean;
  setCleanPrivateData: React.Dispatch<React.SetStateAction<boolean>>;
  imageResize: number;
  setImageResize: React.Dispatch<React.SetStateAction<number>>;
  transfers: { [key: string]: { enabled: boolean; transferred: number; size: number; rate: number } };
  setTransfers: React.Dispatch<
    React.SetStateAction<{
      [key: string]: TransferStats;
    }>
  >;
  upload: () => void;
};

const UploadFileSelection: React.FC<UploadFileSelectionProps> = ({
  uploadBusy,
  servers,
  transfers,
  setTransfers,
  cleanPrivateData,
  setCleanPrivateData,
  imageResize,
  setImageResize,
  files,
  setFiles,
  clearTransfers,
  upload,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { serverInfo } = useServerInfo();

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (uploadBusy) return;

    const selectedFiles = event.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      const newFiles = Array.from(selectedFiles);
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
      clearTransfers();
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    if (uploadBusy) return;
    event.preventDefault();

    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const newFiles = Array.from(droppedFiles);
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
      clearTransfers();
    }
  };

  const sizeOfFilesToUpload = useMemo(() => files.reduce((acc, file) => (acc += file.size), 0), [files]);
  const imagesAreUploaded = useMemo(() => files.some(file => file.type.startsWith('image/')), [files]);
  const serversEnabledCount = useMemo(() => Object.values(transfers).filter(t => t.enabled).length, [transfers]);

  return (
    <>
      <input
        id="browse"
        type="file"
        ref={fileInputRef}
        disabled={uploadBusy}
        hidden
        multiple
        onChange={handleFileChange}
      />
      <label
        htmlFor="browse"
        className="p-12 bg-base-100 rounded-lg hover:text-primary text-neutral-content border-dashed  border-neutral-content border-opacity-50 border-2 block cursor-pointer text-center"
        onDrop={handleDrop}
        onDragOver={event => event.preventDefault()}
      >
        <ArrowUpOnSquareIcon className="w-8 inline" /> Browse or drag & drop
      </label>

      <div className="cursor-pointer gap-4 flex flex-col md:flex-row">
        <div className="flex flex-col gap-4 w-full md:w-1/2">
          <h3 className="text-lg text-neutral-content">Servers</h3>
          <div className="grid gap-2" style={{ gridTemplateColumns: '2em auto' }}>
            {servers.map(s => (
              <CheckBox
                key={s.name}
                name={s.name}
                disabled={uploadBusy}
                checked={transfers[s.name]?.enabled || false}
                setChecked={c =>
                  setTransfers(ut => ({ ...ut, [s.name]: { enabled: c, transferred: 0, size: 0, rate: 0 } }))
                }
              >
                <ServerIcon className="w-6" />
                {s.name} <div className="badge badge-neutral">{serverInfo[s.name].type}</div>
              </CheckBox>
            ))}
          </div>
        </div>
        {imagesAreUploaded && (
          <div className="flex flex-col gap-4 w-full md:w-1/2">
            <h3 className="text-lg text-neutral-content">Image Options</h3>
            <div className="cursor-pointer grid gap-2 items-center" style={{ gridTemplateColumns: '1.5em auto' }}>
              <CheckBox
                name="cleanData"
                disabled={uploadBusy}
                checked={cleanPrivateData}
                setChecked={c => setCleanPrivateData(c)}
              >
                Clean private data in images (EXIF)
              </CheckBox>
              <input
                className="checkbox checkbox-primary "
                id="resizeOption"
                disabled={uploadBusy}
                type="checkbox"
                checked={imageResize > 0}
                onChange={() => setImageResize(irs => (irs > 0 ? 0 : 1))}
              />
              <div>
                <label htmlFor="resizeOption" className="cursor-pointer select-none">
                  Resize Image
                </label>
                <select
                  disabled={uploadBusy || imageResize == 0}
                  className="select select-bordered select-sm ml-4 w-full max-w-xs"
                  onChange={e => setImageResize(e.target.selectedIndex)}
                  value={imageResize}
                >
                  {ResizeOptions.map((ro, i) => (
                    <option key={ro.name} value={i} disabled={i == 0}>
                      {ro.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
      {serversEnabledCount == 1 && (
        <div className="text-sm flex flex-row gap-2 items-center">
          <ExclamationTriangleIcon className="w-6 min-w-6 text-warning" />
          <span>It's recommended to upload to multiple servers to ensure availability and censorship resistance.</span>
        </div>
      )}
      <div className="flex flex-row gap-2 justify-center md:justify-start">
        <button
          className="btn btn-primary"
          onClick={() => upload()}
          disabled={serversEnabledCount < 1 || uploadBusy || files.length == 0}
        >
          Upload{files.length > 0 ? (files.length == 1 ? ` 1 file` : ` ${files.length} files`) : ''} /{' '}
          {formatFileSize(sizeOfFilesToUpload)}
        </button>
        <button
          className="btn  btn-secondary  "
          disabled={uploadBusy || files.length == 0}
          onClick={() => {
            clearTransfers();
            setFiles([]);
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }}
        >
          <TrashIcon className="w-6" />
        </button>
      </div>
    </>
  );
};

export default UploadFileSelection;
