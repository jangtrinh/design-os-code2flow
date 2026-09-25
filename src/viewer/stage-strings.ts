import { lang } from "./audience-names.js";

/** Stage chrome in English and Vietnamese (ADR-0008 §7); any other manifest locale falls back to English. */
const EN = {
  stage: "Stage", back: "Back to all steps", prev: "Previous step", next: "Next step", step: "Step",
  captions: "Captions (C)", notes: "Presenter notes (N)", evidence: "Evidence (I)", language: "Language (L)", live: "Live (E)", fullscreen: "Full screen (F)", keys: "Shortcuts (?)",
  captured: "Captured screen", liveView: "Live app, view only", liveOn: "Live: you control the app", urlOnly: "Live without the bridge: each step reloads the page",
  exitLive: "Exit live", liveUnavailable: "Live view unavailable", notesTitle: "Presenter notes", cue: "Do", note: "Point at", story: "Story", noNotes: "No notes for this step.",
  evidenceTitle: "Evidence", via: "via", notInCode: "not found in code", route: "Screen id", openByHand: "Opens by hand: no URL reaches this screen",
  missing: "Missing screen: in the story, not in the code", loading: "Loading the live app…", frameError: "The live app did not load", retry: "Retry", openPage: "Open page",
  keysTitle: "Shortcuts", kArrows: "Previous / next step", kHomeEnd: "First / last step", kEsc: "Leave Live, close panel, back to all steps",
  nowLive: "Live. The app takes your clicks and keys.", nowView: "View only.", localeNow: "Language: ", allScreens: "all screens",
} as const;
type Key = keyof typeof EN;
const VI: Record<Key, string> = {
  stage: "Sân khấu", back: "Về tất cả các bước", prev: "Bước trước", next: "Bước sau", step: "Bước",
  captions: "Phụ đề (C)", notes: "Ghi chú người trình bày (N)", evidence: "Bằng chứng (I)", language: "Ngôn ngữ (L)", live: "Trực tiếp (E)", fullscreen: "Toàn màn hình (F)", keys: "Phím tắt (?)",
  captured: "Màn hình đã chụp", liveView: "Ứng dụng thật, chỉ xem", liveOn: "Trực tiếp: bạn điều khiển ứng dụng", urlOnly: "Trực tiếp không có bridge: mỗi bước tải lại trang",
  exitLive: "Thoát trực tiếp", liveUnavailable: "Không xem trực tiếp được", notesTitle: "Ghi chú người trình bày", cue: "Làm", note: "Chỉ vào", story: "Câu chuyện", noNotes: "Bước này chưa có ghi chú.",
  evidenceTitle: "Bằng chứng", via: "qua", notInCode: "không tìm thấy trong code", route: "Mã màn hình", openByHand: "Mở bằng tay: không có URL tới màn hình này",
  missing: "Thiếu màn hình: có trong câu chuyện, không có trong code", loading: "Đang tải ứng dụng…", frameError: "Ứng dụng không tải được", retry: "Thử lại", openPage: "Mở trang",
  keysTitle: "Phím tắt", kArrows: "Bước trước / sau", kHomeEnd: "Bước đầu / cuối", kEsc: "Thoát trực tiếp, đóng bảng, về tất cả các bước",
  nowLive: "Trực tiếp. Ứng dụng nhận cú bấm và phím của bạn.", nowView: "Chỉ xem.", localeNow: "Ngôn ngữ: ", allScreens: "mọi màn hình",
};

/** Stage chrome string in the current locale. */
export const t = (key: Key): string => (lang.locale === "vi" ? VI[key] : EN[key]);
