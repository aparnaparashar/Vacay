"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTripData } from "@/context/TripContext";
import { useAuth } from "@/context/AuthContext";
import toast from "react-hot-toast";

// --- Types ---
type TripFile = {
  id: number;
  trip_id: number;
  uploaded_by_user_id: number;
  original_name: string;
  file_size: number;
  mime_type: string;
  description: string | null;
  starred: boolean;
  deleted_at: string | null;
  created_at: string;
  url: string | null;
  links: { id: number; place_id: string | null; reservation_id: string | null }[];
};

export default function FilesPage() {
  const { tripData } = useTripData();
  const { token } = useAuth();
  
  const [files, setFiles] = useState<TripFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [showTrash, setShowTrash] = useState(false);
  const [previewFile, setPreviewFile] = useState<TripFile | null>(null);
  const [assignFileId, setAssignFileId] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fetchFiles = useCallback(async () => {
    if (!tripData.id || !token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/trips/${tripData.id}/files`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setFiles(json.data || []);
      }
    } catch (err) {
      toast.error("Failed to load files.");
    } finally {
      setLoading(false);
    }
  }, [tripData.id, token]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // --- Upload logic ---
  const handleUpload = async (uploadFiles: FileList | null) => {
    if (!uploadFiles || uploadFiles.length === 0 || !tripData.id || !token) return;
    
    setUploading(true);
    for (let i = 0; i < uploadFiles.length; i++) {
      const file = uploadFiles[i];
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`File ${file.name} is too large (max 50MB)`);
        continue;
      }
      if (file.type === "image/svg+xml" || file.name.endsWith(".svg")) {
        toast.error(`SVGs are not allowed for security reasons.`);
        continue;
      }
      
      const formData = new FormData();
      formData.append("file", file);
      
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/trips/${tripData.id}/files`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });
        if (res.ok) {
          toast.success(`${file.name} uploaded`);
        } else {
          toast.error(`Failed to upload ${file.name}`);
        }
      } catch (err) {
        toast.error(`Error uploading ${file.name}`);
      }
    }
    setUploading(false);
    fetchFiles();
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleUpload(e.dataTransfer.files);
  };

  // --- Actions ---
  const toggleStar = async (file: TripFile) => {
    if (!tripData.id || !token) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/trips/${tripData.id}/files/${file.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ starred: !file.starred })
      });
      setFiles(files.map(f => f.id === file.id ? { ...f, starred: !file.starred } : f));
    } catch (err) {
      toast.error("Failed to update file.");
    }
  };

  const toggleTrash = async (file: TripFile, trashed: boolean) => {
    if (!tripData.id || !token) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/trips/${tripData.id}/files/${file.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ trashed })
      });
      fetchFiles();
    } catch (err) {
      toast.error("Failed to update file.");
    }
  };

  const permanentDelete = async (file: TripFile) => {
    if (!tripData.id || !token || !window.confirm("Are you sure you want to permanently delete this file?")) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/trips/${tripData.id}/files/${file.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      setFiles(files.filter(f => f.id !== file.id));
      toast.success("File deleted permanently.");
    } catch (err) {
      toast.error("Failed to delete file.");
    }
  };

  const getExtension = (filename: string) => {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()?.toUpperCase() || '' : 'FILE';
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const isImage = (mime: string) => mime.startsWith("image/");
  const isPdf = (mime: string) => mime === "application/pdf";
  const isDoc = (mime: string) => mime.includes("word") || mime.includes("document") || mime.includes("text/");

  // --- Filtering ---
  const activeFiles = files.filter(f => !f.deleted_at);
  const trashedFiles = files.filter(f => f.deleted_at);

  const filterCounts = useMemo(() => {
    return {
      All: activeFiles.length,
      Starred: activeFiles.filter(f => f.starred).length,
      Images: activeFiles.filter(f => isImage(f.mime_type)).length,
      PDF: activeFiles.filter(f => isPdf(f.mime_type)).length,
      Docs: activeFiles.filter(f => isDoc(f.mime_type)).length,
      Collab: activeFiles.filter(f => f.links && f.links.length > 0).length,
    };
  }, [activeFiles]);

  const displayedFiles = useMemo(() => {
    let source = showTrash ? trashedFiles : activeFiles;
    if (showTrash) return source; // filters don't apply to trash

    switch (activeFilter) {
      case "Starred": return source.filter(f => f.starred);
      case "Images": return source.filter(f => isImage(f.mime_type));
      case "PDF": return source.filter(f => isPdf(f.mime_type));
      case "Docs": return source.filter(f => isDoc(f.mime_type));
      case "Collab": return source.filter(f => f.links && f.links.length > 0);
      default: return source;
    }
  }, [activeFilter, showTrash, activeFiles, trashedFiles]);

  if (!tripData.id) {
    return <div className="p-8 text-center mt-20">Please select a trip first.</div>;
  }

  return (
    <div 
      className={`max-w-5xl mx-auto w-full space-y-8 animate-fade-in pt-[136px] px-8 pb-12 transition-colors ${isDragging ? 'bg-primary-fixed/20 rounded-3xl' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Page Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-on-surface">Files</h2>
          <p className="text-on-surface-variant text-sm mt-1">
            {tripData.origin || "Origin"} → {tripData.destination || "Destination"} •{" "}
            {activeFiles.length} file{activeFiles.length !== 1 ? "s" : ""} found
          </p>
        </div>
        <div className="flex gap-3">
            <input 
              type="file" 
              multiple 
              className="hidden" 
              ref={fileInputRef} 
              onChange={(e) => handleUpload(e.target.files)} 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 rounded-lg border border-outline-variant text-xs font-bold hover:bg-surface-container transition-colors flex items-center gap-2 text-on-surface"
            >
              <span className="material-symbols-outlined text-sm">{uploading ? 'hourglass_empty' : 'upload'}</span>
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
            <button 
              onClick={() => { setShowTrash(!showTrash); setActiveFilter("All"); }}
              className={`px-4 py-2 rounded-lg border border-outline-variant text-xs font-bold transition-colors flex items-center gap-2 ${showTrash ? 'bg-red-50 text-red-600 border-red-200' : 'hover:bg-surface-container text-on-surface'}`}
              title="Trash"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
              {showTrash ? 'Exit Trash' : 'Trash'}
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        {!showTrash && (
          <div className="flex flex-wrap gap-2 mb-6">
            {Object.entries(filterCounts).map(([key, count]) => {
              if (count === 0 && key !== "All") return null;
              const active = activeFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveFilter(key)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 border ${
                    active 
                      ? 'bg-primary text-on-primary border-primary shadow-sm' 
                      : 'bg-surface text-on-surface-variant border-outline-variant hover:bg-surface-container'
                  }`}
                >
                  {key}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${active ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container text-on-surface-variant'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* File List */}
        <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-on-surface-variant">Loading files...</div>
          ) : displayedFiles.length === 0 ? (
            <div className="p-16 text-center flex flex-col items-center">
              <span className="material-symbols-outlined text-6xl text-primary/40 mb-4">folder_open</span>
              <h3 className="text-lg font-bold text-on-surface">No files found</h3>
              <p className="text-on-surface-variant max-w-sm mt-2">
                {isDragging ? 'Drop files here to upload' : 'Drag and drop files here, or click Upload to add documents to your trip.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-outline-variant">
              {displayedFiles.map(file => (
                <div key={file.id} className={`group flex items-center justify-between p-4 hover:bg-surface-container transition-colors ${showTrash ? 'opacity-60' : ''}`}>
                  
                  {/* Left: Icon & Info */}
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-lg bg-surface-container border border-outline-variant flex items-center justify-center overflow-hidden shrink-0">
                      {isImage(file.mime_type) && file.url ? (
                        <img src={file.url} alt={file.original_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className={`text-xs font-bold ${isPdf(file.mime_type) ? 'text-error' : 'text-on-surface-variant'}`}>
                          {getExtension(file.original_name)}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {file.starred && !showTrash && <span className="material-symbols-outlined text-[16px] text-yellow-400 fill-current">star</span>}
                        <button 
                          className="font-semibold text-on-surface truncate hover:text-primary transition-colors text-left"
                          onClick={() => setPreviewFile(file)}
                        >
                          {file.original_name}
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant mt-1">
                        <span>{formatSize(file.file_size)}</span>
                        <span>•</span>
                        <span>{new Date(file.created_at).toLocaleDateString()}</span>
                        
                        {/* Linked badges */}
                        {file.links && file.links.length > 0 && (
                          <div className="flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                            <span className="material-symbols-outlined text-[12px]">link</span>
                            {file.links.length} linked
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                    {!showTrash ? (
                      <>
                        <button onClick={() => toggleStar(file)} className="p-2 text-on-surface-variant hover:text-yellow-400 transition-colors rounded-full hover:bg-surface-container">
                          <span className={`material-symbols-outlined text-[20px] ${file.starred ? 'fill-current text-yellow-400' : ''}`}>star</span>
                        </button>
                        <button onClick={() => setAssignFileId(file.id)} className="p-2 text-on-surface-variant hover:text-primary transition-colors rounded-full hover:bg-surface-container">
                          <span className="material-symbols-outlined text-[20px]">add_link</span>
                        </button>
                        <a href={file.url || "#"} target="_blank" rel="noreferrer" className="p-2 text-on-surface-variant hover:text-on-surface transition-colors rounded-full hover:bg-surface-container flex items-center">
                          <span className="material-symbols-outlined text-[20px]">download</span>
                        </a>
                        <button onClick={() => toggleTrash(file, true)} className="p-2 text-on-surface-variant hover:text-error transition-colors rounded-full hover:bg-surface-container">
                          <span className="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => toggleTrash(file, false)} className="p-2 text-on-surface-variant hover:text-green-600 transition-colors rounded-full hover:bg-green-50" title="Restore">
                          <span className="material-symbols-outlined text-[20px]">restore_from_trash</span>
                        </button>
                        <button onClick={() => permanentDelete(file)} className="p-2 text-on-surface-variant hover:text-error transition-colors rounded-full hover:bg-red-50" title="Delete Permanently">
                          <span className="material-symbols-outlined text-[20px]">delete_forever</span>
                        </button>
                      </>
                    )}
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>

      {/* Lightbox / Previews */}
      {previewFile && isImage(previewFile.mime_type) && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setPreviewFile(null)}>
          <button className="absolute top-6 right-6 text-white bg-white/10 p-2 rounded-full hover:bg-white/20">
            <span className="material-symbols-outlined">close</span>
          </button>
          <img src={previewFile.url || ""} alt={previewFile.original_name} className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {previewFile && isPdf(previewFile.mime_type) && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 md:p-12 backdrop-blur-sm" onClick={() => setPreviewFile(null)}>
          <div className="bg-white w-full max-w-5xl h-full rounded-2xl overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-bold truncate">{previewFile.original_name}</h3>
              <div className="flex gap-2">
                <a href={previewFile.url || ""} target="_blank" rel="noreferrer" className="p-2 hover:bg-gray-100 rounded-full">
                  <span className="material-symbols-outlined text-[20px]">open_in_new</span>
                </a>
                <button onClick={() => setPreviewFile(null)} className="p-2 hover:bg-gray-100 rounded-full">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>
            <div className="flex-1 w-full bg-gray-100 relative">
              <object data={previewFile.url || ""} type="application/pdf" className="w-full h-full">
                <p className="p-8 text-center">Your browser does not support PDFs. <a href={previewFile.url || ""} className="text-blue-500 underline">Download it</a> instead.</p>
              </object>
            </div>
          </div>
        </div>
      )}

      {previewFile && !isImage(previewFile.mime_type) && !isPdf(previewFile.mime_type) && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setPreviewFile(null)}>
          <div className="bg-white p-8 rounded-2xl max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-xl mb-4 text-center">File Preview Not Available</h3>
            <p className="text-gray-600 text-center mb-6">{previewFile.original_name}</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => setPreviewFile(null)} className="px-6 py-2 rounded-full border border-gray-300 font-bold hover:bg-gray-50">Close</button>
              <a href={previewFile.url || ""} target="_blank" rel="noreferrer" className="px-6 py-2 rounded-full bg-[#E67E22] text-white font-bold hover:bg-[#D67119]">Download</a>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal Stub */}
      {assignFileId && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setAssignFileId(null)}>
          <div className="bg-white p-8 rounded-2xl max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-xl mb-4">Link File</h3>
            <p className="text-gray-500 text-sm mb-6">Select places or reservations to link this file to. (UI integration pending)</p>
            <button onClick={() => setAssignFileId(null)} className="w-full py-2 bg-gray-900 text-white rounded-xl font-bold">Done</button>
          </div>
        </div>
      )}

    </div>
  );
}
