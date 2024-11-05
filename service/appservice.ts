import path from "node:path";
import fs from "node:fs";
import { execSync } from 'node:child_process';
import {
  createFolder,
  downloadFile,
  getFileContent,
  listChildrenOfFolder,
  listFolder,
  uploadFile,
  rootFolderId
} from "./googleservice.ts";
import process from "node:process";
import { Buffer } from "node:buffer";
import unzipper from "npm:unzipper";
import archiver from "npm:archiver";

const listGames = async () => {
  const games = await listFolder(rootFolderId) || [];

  const gamesDetails = games.map((game) => {
    return {
      name: game.name,
      id: game.id,
    };
  });

  return gamesDetails;
};

const ensureDirectoryExistence = (filePath: string) => {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
};

const getSteamPathWindows = (): string | null => {
  try {
    const steamPath = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', { encoding: 'utf8' });
    const match = steamPath.match(/SteamPath\s+REG_SZ\s+(.+)/);
    if (match) {
      return match[1].trim();
    }
  } catch (error) {
    console.error('Error querying Steam path from registry:', error);
  }
  return null;
};

const pathResolver = (gamepath: string) => {
  const lookupTable = {
    "%APPDATA%": process.env.APPDATA!,
    "%LOCALAPPDATA%": process.env.LOCALAPPDATA!,
    "%PROGRAMFILES%": process.env.PROGRAMFILES!,
    "%PROGRAMFILES(X86)%": process.env["PROGRAMFILES(X86)"]!,
    "%USERPROFILE%": process.env.USERPROFILE!,
    "<Steam-folder>": getSteamPathWindows() || "",
  };

  
  // Handle <user-id> placeholder
  const userIdIndex = gamepath.indexOf("<user-id>");
  if (userIdIndex !== -1) {
    gamepath = gamepath.substring(0, userIdIndex);
  }
  
  for (const [key, value] of Object.entries(lookupTable)) {
    if (gamepath.includes(key)) {
      gamepath = gamepath.replace(key, value);
    }
  }
  
  gamepath = path.normalize(gamepath);
  while (gamepath.at(-1) === path.sep) {
    gamepath = gamepath.slice(0, -1);
  }

  return gamepath;
};

const decompress = async (fileId: string, dest: string) => {
  try {
    const resolvedDest = pathResolver(dest);
    // const fileMetadata = await getFileMetadata(fileId);
    // console.log(`File name: ${fileMetadata.name}`);

    const response = await downloadFile(fileId);
    const buffer = Buffer.from(response);

    const bufferStream = new unzipper.Parse();
    bufferStream.on(
      "entry",
      (
        entry: {
          path: string;
          type: string;
          pipe: (arg0: fs.WriteStream) => void;
          autodrain: () => void;
        },
      ) => {
        const filePath = path.join(resolvedDest, entry.path);
        ensureDirectoryExistence(filePath);
        if (entry.type === "File") {
          entry.pipe(fs.createWriteStream(filePath));
        } else {
          entry.autodrain();
        }
      },
    );

    bufferStream.end(buffer);
    // console.log(`File decompressed to ${resolvedDest}`);
  } catch (error) {
    console.error("Error:", error);
  }
};

const createNewGameSave = async (gameName: string, saveLocation: string) => {
  const newFolderId = await createFolder(gameName, rootFolderId);
  fs.writeFileSync("metadata.txt", saveLocation);
  await uploadFile("metadata.txt", newFolderId, "text/plain");
  fs.unlinkSync("metadata.txt");
  await saveGame(newFolderId, saveLocation);
  return newFolderId;
};

const saveGame = async (folderId: string, saveLocation: string) => {
  const zippedFile = compress(saveLocation);
  await uploadFile(zippedFile, folderId);
  fs.unlinkSync(zippedFile);
};

const getGameSaveLocation = async (folderId: string) => {
  const listedFiles = await listChildrenOfFolder(folderId);
  if (listedFiles) {
    const metadataFile = listedFiles.find((file) =>
      file.name?.includes("metadata")
    );
    if (metadataFile) {
      if (metadataFile.id) {
        const metadata = await getFileContent(metadataFile.id);
        return metadata;
      }
    }
    return null;
  }
};

const getGameSaveId = async (folderId: string) => {
  const listedFiles = await listChildrenOfFolder(folderId);
  if (listedFiles) {
    const saveFile = listedFiles.find((file) => file.name?.includes(".zip"));
    if (saveFile) {
      return saveFile.id;
    }
  }
  return null;
};

const compress = (folderPath: string) => {
  const resolvedFolderPath = pathResolver(folderPath);
  const folderName = resolvedFolderPath.split(path.sep).pop()!;
  const outputPath = `${folderName}.zip`;
  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", {
    zlib: { level: 9 },
  });

  archive.pipe(output);

  archive.directory(resolvedFolderPath, false);

  archive.finalize();

  return outputPath;
};

const autosave = async (folderId: string, interval: number) => {
  const gameLocation = await getGameSaveLocation(folderId);
  if (gameLocation) {
    const options: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    };

    const intervalId = setInterval(async () => {
      try {
        const zippedFile = compress(gameLocation as string);
        await uploadFile(zippedFile, folderId);
        fs.unlinkSync(zippedFile);
        console.log(
          `Autosave was executed at ${new Date().toLocaleString(undefined, options)
          }`,
        );
      } catch (error) {
        console.error("Error compressing folder:", error);
      }
    }, interval);

    return intervalId;
  }
};

export {
  autosave,
  compress,
  createNewGameSave,
  decompress,
  ensureDirectoryExistence,
  getGameSaveId,
  getGameSaveLocation,
  listGames,
  pathResolver,
  rootFolderId,
  saveGame,
  getSteamPathWindows,
};
