#!/usr/bin/env swift

import AppKit
import Foundation

let canvasWidth = 1320
let canvasHeight = 2868
let canvasSize = NSSize(width: canvasWidth, height: canvasHeight)

guard CommandLine.arguments.count == 5 else {
  fputs("usage: generate-ios-store-screenshots.swift <brand-banner> <brand-icon> <raw-dir> <output-dir>\n", stderr)
  exit(2)
}

let bannerPath = CommandLine.arguments[1]
let iconPath = CommandLine.arguments[2]
let rawDirectory = CommandLine.arguments[3]
let outputDirectory = CommandLine.arguments[4]

guard let brandBanner = NSImage(contentsOfFile: bannerPath),
      let brandIcon = NSImage(contentsOfFile: iconPath) else {
  fputs("브랜드 이미지를 불러오지 못했습니다.\n", stderr)
  exit(2)
}

try FileManager.default.createDirectory(
  at: URL(fileURLWithPath: outputDirectory),
  withIntermediateDirectories: true
)

func topRect(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat) -> NSRect {
  NSRect(x: x, y: CGFloat(canvasHeight) - y - height, width: width, height: height)
}

func drawImage(_ image: NSImage, in rect: NSRect, radius: CGFloat = 0) {
  NSGraphicsContext.saveGraphicsState()
  if radius > 0 {
    NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).addClip()
  }
  NSGraphicsContext.current?.imageInterpolation = .high
  image.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1)
  NSGraphicsContext.restoreGraphicsState()
}

func drawText(
  _ value: String,
  in rect: NSRect,
  size: CGFloat,
  weight: NSFont.Weight,
  color: NSColor,
  alignment: NSTextAlignment = .left
) {
  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = alignment
  paragraph.lineBreakMode = .byWordWrapping
  let attributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: size, weight: weight),
    .foregroundColor: color,
    .paragraphStyle: paragraph,
  ]
  NSAttributedString(string: value, attributes: attributes).draw(in: rect)
}

func drawScreenshotCard(_ screenshot: NSImage, rect: NSRect, radius: CGFloat) {
  let context = NSGraphicsContext.current?.cgContext
  context?.saveGState()
  context?.setShadow(offset: CGSize(width: 0, height: -18), blur: 34, color: NSColor.black.withAlphaComponent(0.16).cgColor)
  NSColor.white.setFill()
  NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
  context?.restoreGState()
  drawImage(screenshot, in: rect, radius: radius)
}

func render(filename: String, drawing: () -> Void) throws {
  guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: canvasWidth,
    pixelsHigh: canvasHeight,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ), let graphics = NSGraphicsContext(bitmapImageRep: bitmap) else {
    throw NSError(domain: "StoreScreenshots", code: 1)
  }

  bitmap.size = canvasSize
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = graphics
  drawing()
  graphics.flushGraphics()
  NSGraphicsContext.restoreGraphicsState()

  guard let jpeg = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.96]) else {
    throw NSError(domain: "StoreScreenshots", code: 2)
  }
  try jpeg.write(to: URL(fileURLWithPath: outputDirectory).appendingPathComponent(filename))
}

func loadRaw(_ name: String) throws -> NSImage {
  let path = URL(fileURLWithPath: rawDirectory).appendingPathComponent(name).path
  guard let image = NSImage(contentsOfFile: path) else {
    throw NSError(domain: "StoreScreenshots", code: 3, userInfo: [NSLocalizedDescriptionKey: path])
  }
  return image
}

let navy = NSColor(calibratedRed: 0.07, green: 0.14, blue: 0.35, alpha: 1)
let blue = NSColor(calibratedRed: 0.25, green: 0.52, blue: 0.96, alpha: 1)

let slides: [(String, String, String, String, Bool)] = [
  ("02-plan-together.jpg", "함께 만드는 여행 일정", "친구들과 날짜별 계획을 한눈에 맞춰요", "itinerary.jpg", true),
  ("03-duri-check.jpg", "취향 차이는 두리가 조율", "일정의 균형과 빠진 부분을 함께 점검해요", "duri-analysis-result.jpg", true),
  ("04-explore-busan.jpg", "가고 싶은 장소를 한곳에서", "지역별 명소를 찾고 여행 후보로 바로 담아요", "explore-busan.jpg", false),
  ("05-trip-room.jpg", "우리 여행의 진행 상황", "멤버 응답부터 일정 준비까지 함께 확인해요", "trip-room.jpg", true),
  ("06-easy-start.jpg", "쉽고 안전하게 시작", "Apple·카카오·이메일 로그인으로 바로 시작해요", "login.jpg", false),
]

let home = try loadRaw("home.jpg")
try render(filename: "01-together-home.jpg") {
  NSColor.white.setFill()
  NSBezierPath(rect: NSRect(origin: .zero, size: canvasSize)).fill()
  drawImage(brandBanner, in: topRect(0, 0, 1320, 644))
  drawScreenshotCard(home, rect: topRect(148, 606, 1024, 2226), radius: 54)
}

for slide in slides {
  let screenshot = try loadRaw(slide.3)
  let slideIcon = NSImage(contentsOfFile: iconPath) ?? brandIcon
  try render(filename: slide.0) {
    NSGradient(colors: [
      NSColor(calibratedRed: 0.93, green: 0.96, blue: 1.00, alpha: 1),
      NSColor(calibratedRed: 0.97, green: 0.94, blue: 1.00, alpha: 1),
    ])?.draw(in: NSRect(origin: .zero, size: canvasSize), angle: 270)

    let textX: CGFloat = slide.4 ? 226 : 68
    if slide.4 {
      drawImage(slideIcon, in: topRect(68, 58, 128, 128), radius: 28)
    }
    drawText(slide.1, in: topRect(textX, 57, 1252 - textX, 76), size: 58, weight: .bold, color: navy)
    drawText(slide.2, in: topRect(textX + 2, 142, 1250 - textX, 52), size: 30, weight: .medium, color: blue)
    drawScreenshotCard(screenshot, rect: topRect(90, 246, 1140, 2477), radius: 58)
  }
}

print("App Store screenshots generated in \(outputDirectory)")
