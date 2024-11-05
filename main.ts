import inquirer from "npm:inquirer";
import {
  autosave,
  createNewGameSave,
  decompress,
  getGameSaveId,
  getGameSaveLocation,
  listGames,
  saveGame,
} from "./service/appservice.ts";
import process from "node:process";

const startTUI = async () => {
  while (true) {
    const mainMenuAnswers = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "Hãy chọn thao tác:",
        choices: [
          "Tìm game đã lưu",
          "Tạo tệp lưu mới",
          "Thoát",
        ],
      },
    ]);

    if (mainMenuAnswers.action === "Tìm game đã lưu") {
      const folders = await listGames() || [];
      const chooseGameAnswers = await inquirer.prompt([
        {
          type: "list",
          name: "folderId",
          message: "Chọn game:",
          choices: folders.map((folder) => ({
            name: folder.name || "Unnamed Game",
            value: folder.id,
          })),
          pageSize: 3,
          loop: false,
        },
      ]);

      const folderId = chooseGameAnswers.folderId;
      const selectedGame = folders.find(folder => folder.id === folderId);

      while (true) {
        console.clear();
        console.log(`Game đã chọn: ${selectedGame?.name || "Unnamed Game"}`);
        let intervalId: number | undefined;

        const gameActionAnswers = await inquirer.prompt([
          {
            type: "list",
            name: "action",
            message: "Hãy chọn thao tác:",
            choices: [
              "Sao lưu",
              "Khôi phục",
              "Tự động lưu",
              "Quay lại",
            ],
          },
        ]);

        if (gameActionAnswers.action === "Sao lưu") {
          const gameMetadata = await getGameSaveLocation(folderId);
          if (gameMetadata) {
            await saveGame(folderId, gameMetadata as string);
            console.log("Sao lưu thành công.");
          } else {
            console.error("Thất bại.");
          }
        } else if (gameActionAnswers.action === "Khôi phục") {
          const gameMetadata = await getGameSaveLocation(folderId);
          const gameSaveId = await getGameSaveId(folderId);
          if (gameMetadata && gameSaveId) {
            await decompress(gameSaveId, gameMetadata as string);
            console.log("Khôi phục thành công.");
          } else {
            console.error("Failed to retrieve game metadata or save ID.");
          }
        } else if (gameActionAnswers.action === "Tự động lưu") {
          const autosaveOptions = await inquirer.prompt([
            {
              type: "list",
              name: "interval",
              message: "Chọn thời gian tự động lưu:",
              choices: [
                // { name: "1 phút", value: 1 * 60 * 1000 },
                { name: "5 phút", value: 5 * 60 * 1000 },
                { name: "10 phút", value: 10 * 60 * 1000 },
                { name: "15 phút", value: 15 * 60 * 1000 },
              ],
            },
          ]);

          intervalId = await autosave(folderId, autosaveOptions.interval);
        } else if (gameActionAnswers.action === "Quay lại") {
          console.clear();
          break; // Exit the inner while loop to return to the main menu
        }

        console.log("Ấn bất kỳ phím nào để quay lại.");
        await new Promise<void>((resolve) => {
          process.stdin.setRawMode(true);
          process.stdin.resume();
          process.stdin.once('data', () => {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            if (intervalId) {
              clearInterval(intervalId);
            }
            console.clear();
            resolve();
          });
        });
      }
    } else if (mainMenuAnswers.action === "Tạo tệp lưu mới") {
      const createFolderAnswers = await inquirer.prompt([
        {
          type: "input",
          name: "folderName",
          message: "Nhập tên game:",
        },
        {
          type: "input",
          name: "saveLocation",
          message: "Nhập vị trí lưu của game:",
        },
      ]);
      await createNewGameSave(
        createFolderAnswers.folderName,
        createFolderAnswers.saveLocation
      );

      console.log("Tệp lưu đã tạo và sao lưu thành công.");
      console.log("Ấn bất kỳ phím nào để quay lại.");
      await new Promise<void>((resolve) => {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.once('data', () => {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          console.clear();
          resolve();
        });
      });
    } else if (mainMenuAnswers.action === "Thoát") {
      console.log("Tam biệt!");
      process.exit(0);
    }
  }
};

await startTUI();