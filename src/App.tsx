import React, { useState, useRef, useCallback } from 'react';
import { Upload, Download, Image as ImageIcon, AlertCircle, Trash2, Archive } from 'lucide-react';
import JSZip from 'jszip';

interface FileWithPreview {
  file: File;
  preview: string;
  optimized: boolean;
}

function App() {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((inputFiles: FileList | null) => {
    if (!inputFiles) return;

    const newFiles = Array.from(inputFiles)
      .filter(file => file.type.includes('png'))
      .map(file => ({
        file,
        preview: URL.createObjectURL(file),
        optimized: false
      }));

    if (newFiles.length === 0) {
      setError('Veuillez sélectionner uniquement des fichiers PNG');
      return;
    }

    setFiles(prev => [...prev, ...newFiles]);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeFile = (index: number) => {
    setFiles(prev => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].preview);
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const convertToIco = async (file: FileWithPreview) => {
    return new Promise<Blob>((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        canvas.width = 256;
        canvas.height = 256;

        if (ctx) {
          // Enable transparency
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Maintain aspect ratio
          const scale = Math.min(
            canvas.width / img.width,
            canvas.height / img.height
          );
          const x = (canvas.width - img.width * scale) / 2;
          const y = (canvas.height - img.height * scale) / 2;

          ctx.drawImage(
            img,
            x,
            y,
            img.width * scale,
            img.height * scale
          );

          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error('La conversion a échoué'));
            },
            'image/x-icon'
          );
        }
      };

      img.onerror = () => reject(new Error('Impossible de charger l\'image'));
      img.src = file.preview;
    });
  };

  const downloadSingleFile = async (file: FileWithPreview) => {
    try {
      const blob = await convertToIco(file);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.file.name.replace('.png', '')}.ico`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Erreur lors de la conversion de ${file.file.name}`);
    }
  };

  const downloadAsZip = async () => {
    if (files.length === 0) return;
    setIsConverting(true);
    setError(null);

    try {
      const zip = new JSZip();
      const promises = files.map(async (file) => {
        try {
          const blob = await convertToIco(file);
          zip.file(`${file.file.name.replace('.png', '')}.ico`, blob);
        } catch (err) {
          throw new Error(`Échec de la conversion de ${file.file.name}`);
        }
      });

      await Promise.all(promises);
      
      const date = new Date();
      const formattedDate = date.toLocaleDateString('fr-FR').replace(/\//g, '-');
      const formattedTime = date.toLocaleTimeString('fr-FR').replace(/:/g, '-');
      const fileName = `icons_${files.length}_${formattedDate}_${formattedTime}.zip`;

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la conversion des fichiers');
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-black text-white overflow-hidden relative">
      {/* Animated background */}
      <div className="fixed inset-0 bg-[conic-gradient(at_top,_var(--tw-gradient-stops))] from-blue-900 via-purple-900 to-blue-900 opacity-50 animate-pulse-slow"></div>
      
      <div className="relative z-10 container mx-auto px-4 py-8 min-h-screen flex flex-col">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500">
            Convertisseur PNG vers ICO
          </h1>
          <p className="text-xl text-gray-300">
            Convertissez vos images PNG en format ICO avec des fonctionnalités avancées
          </p>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          <div 
            className={`gradient-border w-full max-w-4xl transition-all duration-300 ${
              isDragging ? 'scale-105' : ''
            }`}
          >
            <div
              className={`w-full bg-gray-900/80 backdrop-blur-xl rounded-xl p-8 transition-all duration-300`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => handleFiles(e.target.files)}
                accept=".png"
                multiple
                className="hidden"
              />

              <div className="text-center">
                {files.length === 0 ? (
                  <div className="space-y-4 py-12">
                    <Upload className="w-16 h-16 mx-auto text-blue-400 animate-bounce" />
                    <div>
                      <p className="text-xl text-gray-300">
                        Déposez vos fichiers PNG ici ou cliquez pour parcourir
                      </p>
                      <p className="text-sm text-gray-400 mt-2">
                        Supporte plusieurs fichiers et la transparence
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {files.map((file, index) => (
                      <div
                        key={file.preview}
                        className="relative group"
                        style={{ animationDelay: `${index * 0.1}s` }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="relative bg-gray-800 rounded-lg p-4">
                          <img
                            src={file.preview}
                            alt="Aperçu"
                            className="w-full h-32 object-contain rounded-lg mb-2"
                          />
                          <p className="text-sm text-gray-300 truncate">
                            {file.file.name}
                          </p>
                          <div className="absolute top-2 right-2 flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadSingleFile(file);
                              }}
                              className="p-1 rounded-full bg-gray-700 hover:bg-blue-600 transition-colors"
                              title="Télécharger"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(index);
                              }}
                              className="p-1 rounded-full bg-gray-700 hover:bg-red-600 transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 p-4 bg-red-900/20 rounded-lg animate-pulse">
              <AlertCircle className="w-5 h-5" />
              <p>{error}</p>
            </div>
          )}

          {files.length > 0 && (
            <div className="flex gap-4">
              <button
                onClick={downloadAsZip}
                disabled={isConverting}
                className={`
                  relative overflow-hidden px-8 py-4 rounded-full font-medium text-lg
                  transition-all duration-300 transform hover:scale-105
                  bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white
                `}
              >
                <div className="flex items-center gap-2">
                  <Archive className="w-5 h-5" />
                  {isConverting ? 'Conversion en cours...' : 'Télécharger en ZIP'}
                </div>
                <div className="shine-effect absolute inset-0"></div>
              </button>
            </div>
          )}

          <div className="flex items-center justify-center gap-4 text-gray-400">
            <div className="flex items-center gap-1">
              <ImageIcon className="w-4 h-4" />
              <p className="text-sm">Support PNG</p>
            </div>
            <div className="w-1 h-1 bg-gray-700 rounded-full"></div>
            <p className="text-sm">Transparence</p>
            <div className="w-1 h-1 bg-gray-700 rounded-full"></div>
            <p className="text-sm">Conversion multiple</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;