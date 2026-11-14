// A bridge between a browser on this Mac and the mBot, for testing on the real robot from a
// browser that has no Web Bluetooth: a WebSocket on 127.0.0.1:8766 on one side, Bluetooth Low
// Energy on the other. One browser at a time; the robot is let go when the browser leaves.
//
//   swiftc -O tools/mbot-bridge.swift -o /tmp/mbot-bridge && /tmp/mbot-bridge
//
// The browser sends "find" and then the packets as binary messages; it receives
// {"state": "ready" | "gone" | "no-bluetooth"} as text and the robot's answers as binary.
import CoreBluetooth
import Foundation
import Network

let serviceID = CBUUID(string: "FFE1"), notifyID = CBUUID(string: "FFE2"), writeID = CBUUID(string: "FFE3")
let namePrefixes = ["Makeblock", "makeblock", "MakeBlock", "mBot"]
let started = Date()

func log(_ text: String) {
  print(String(format: "%8.3f  %@", Date().timeIntervalSince(started), text))
  fflush(stdout)
}

func hex(_ data: Data) -> String {
  data.map { String(format: "%02x", $0) }.joined(separator: " ")
}

final class Bridge: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
  private var central: CBCentralManager!
  private var listener: NWListener!
  private var browser: NWConnection?
  private var robot: CBPeripheral?
  private var writer: CBCharacteristic?
  /// A robot being let go: nothing new starts until it has really gone.
  private var leaving: CBPeripheral?
  private var findLater = false
  private var seen = Set<UUID>()

  func start() throws {
    central = CBCentralManager(delegate: self, queue: .main)
    let socket = NWProtocolWebSocket.Options()
    socket.autoReplyPing = true
    // Only pages served from this computer may drive the robot.
    socket.setClientRequestHandler(.main) { _, headers in
      let origin = headers.first { $0.name.lowercased() == "origin" }?.value
      let local = origin.map { $0.hasPrefix("http://127.0.0.1") || $0.hasPrefix("http://localhost") } ?? true
      if !local { log("refused a page from \(origin ?? "?")") }
      return NWProtocolWebSocket.Response(status: local ? .accept : .reject, subprotocol: nil)
    }
    let parameters = NWParameters.tcp
    parameters.defaultProtocolStack.applicationProtocols.insert(socket, at: 0)
    parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: 8766)
    parameters.allowLocalEndpointReuse = true
    listener = try NWListener(using: parameters)
    listener.newConnectionHandler = { [unowned self] connection in self.welcome(connection) }
    listener.start(queue: .main)
    log("waiting for a browser on ws://127.0.0.1:8766")
  }

  // The browser's side

  private func welcome(_ connection: NWConnection) {
    browser?.cancel()
    letGo()
    browser = connection
    connection.stateUpdateHandler = { [unowned self] state in
      switch state {
      case .ready: log("browser arrived")
      case .failed, .cancelled:
        guard self.browser === connection else { return }
        log("browser left")
        self.browser = nil
        self.letGo()
      default: break
      }
    }
    connection.start(queue: .main)
    listen(connection)
  }

  private func listen(_ connection: NWConnection) {
    connection.receiveMessage { [unowned self] data, context, _, error in
      guard error == nil, let data,
        let message = context?.protocolMetadata(definition: NWProtocolWebSocket.definition) as? NWProtocolWebSocket.Metadata
      else { return connection.cancel() }
      switch message.opcode {
      case .text: self.find()
      case .binary: self.write(data)
      case .close: return connection.cancel()
      default: break
      }
      self.listen(connection)
    }
  }

  private func tell(_ state: String, _ more: [String: Any] = [:]) {
    var message = more
    message["state"] = state
    log("-- \(message)")
    guard let json = try? JSONSerialization.data(withJSONObject: message) else { return }
    send(json, .text)
  }

  private func send(_ data: Data, _ opcode: NWProtocolWebSocket.Opcode) {
    let context = NWConnection.ContentContext(identifier: "message", metadata: [NWProtocolWebSocket.Metadata(opcode: opcode)])
    browser?.send(content: data, contentContext: context, isComplete: true, completion: .idempotent)
  }

  // The robot's side

  private func find() {
    // Bluetooth still starting, or a robot still leaving: the search starts when that is over.
    guard central.state != .unknown, central.state != .resetting, leaving == nil else { return findLater = true }
    guard central.state == .poweredOn else { return tell("no-bluetooth", ["why": central.state.rawValue]) }
    guard robot == nil else { return }
    findLater = false
    log("looking for the mBot")
    central.scanForPeripherals(withServices: nil)
  }

  private func write(_ data: Data) {
    guard let robot, let writer else { return }
    log("> \(hex(data))")
    robot.writeValue(data, for: writer, type: writer.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse)
  }

  private func letGo() {
    central.stopScan()
    findLater = false
    if let robot {
      leaving = robot
      central.cancelPeripheralConnection(robot)
    }
    robot = nil
    writer = nil
  }

  private func lost(_ why: String) {
    robot = nil
    writer = nil
    tell("gone", ["why": why])
    browser?.cancel()
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    log("bluetooth state \(central.state.rawValue) (5 is on, 3 is not allowed)")
    if findLater { find() }
  }

  func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi: NSNumber) {
    let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? peripheral.name ?? ""
    let services = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []
    let mBot = namePrefixes.contains { name.hasPrefix($0) } || services.contains(serviceID)
    if mBot, seen.insert(peripheral.identifier).inserted {
      log("found \"\(name)\" (device name \"\(peripheral.name ?? "")\"), services \(services), signal \(rssi)")
    }
    guard mBot, robot == nil else { return }
    central.stopScan()
    robot = peripheral
    peripheral.delegate = self
    central.connect(peripheral)
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    peripheral.discoverServices([serviceID])
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    guard peripheral === robot else { return }
    lost("could not connect: \(error?.localizedDescription ?? "")")
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    if peripheral === leaving {
      leaving = nil
      if findLater { find() }
    } else if peripheral === robot {
      lost(error?.localizedDescription ?? "let go")
    }
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard let service = peripheral.services?.first(where: { $0.uuid == serviceID }) else { return central.cancelPeripheralConnection(peripheral) }
    peripheral.discoverCharacteristics([notifyID, writeID], for: service)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    writer = service.characteristics?.first { $0.uuid == writeID }
    guard writer != nil, let reader = service.characteristics?.first(where: { $0.uuid == notifyID }) else { return central.cancelPeripheralConnection(peripheral) }
    peripheral.setNotifyValue(true, for: reader)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
    guard let writer else { return }
    tell("ready", ["name": peripheral.name ?? "", "quick": writer.properties.contains(.writeWithoutResponse)])
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    guard let data = characteristic.value else { return }
    log("< \(hex(data))")
    send(data, .binary)
  }
}

let bridge = Bridge()
do {
  try bridge.start()
} catch {
  log("could not start: \(error)")
  exit(1)
}
RunLoop.main.run()
