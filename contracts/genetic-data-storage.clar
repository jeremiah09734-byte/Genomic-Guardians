;; GeneticDataStorage.clar
;; This contract handles the immutable storage of genetic data hashes, metadata, and related features.
;; It serves as the core ledger for genetic information in the Genomic Guardians platform.
;; Features include registration, versioning, licensing, categorization, collaboration, status updates, and revenue sharing.
;; All data is stored immutably using maps, ensuring tamper-proof records.

;; Constants
(define-constant ERR-ALREADY-REGISTERED u1)
(define-constant ERR-NOT-OWNER u2)
(define-constant ERR-INVALID-HASH u3)
(define-constant ERR-INVALID-PARAM u4)
(define-constant ERR-NOT-AUTHORIZED u5)
(define-constant ERR-EXPIRED u6)
(define-constant ERR-INVALID-SHARE u7)
(define-constant ERR-MAX-TAGS-EXCEEDED u8)
(define-constant ERR-MAX-PERMS-EXCEEDED u9)
(define-constant ERR-PAUSED u10)

;; Data Maps
(define-map genetic-registry
  { data-hash: (buff 32) }  ;; SHA-256 hash of genetic data
  {
    owner: principal,
    timestamp: uint,
    data-type: (string-utf8 50),  ;; e.g., "whole-genome", "exome"
    description: (string-utf8 500)
  }
)

(define-map data-versions
  { original-hash: (buff 32), version: uint }
  {
    updated-hash: (buff 32),
    update-notes: (string-utf8 200),
    timestamp: uint
  }
)

(define-map data-licenses
  { data-hash: (buff 32), licensee: principal }
  {
    expiry: uint,
    terms: (string-utf8 200),
    active: bool,
    access-level: (string-utf8 20)  ;; e.g., "read-only", "research-use"
  }
)

(define-map data-categories
  { data-hash: (buff 32) }
  {
    category: (string-utf8 50),  ;; e.g., "health", "ancestry"
    tags: (list 20 (string-utf8 30))
  }
)

(define-map data-collaborators
  { data-hash: (buff 32), collaborator: principal }
  {
    role: (string-utf8 50),  ;; e.g., "family-member", "physician"
    permissions: (list 10 (string-utf8 20)),  ;; e.g., "view", "update"
    added-at: uint
  }
)

(define-map data-status
  { data-hash: (buff 32) }
  {
    status: (string-utf8 20),  ;; e.g., "active", "archived"
    visibility: bool,  ;; true for public, false for private
    last-updated: uint
  }
)

(define-map revenue-shares
  { data-hash: (buff 32), participant: principal }
  {
    percentage: uint,  ;; 0-100
    total-received: uint  ;; In micro-STX or token units
  }
)

;; Variables
(define-data-var contract-paused bool false)
(define-data-var contract-admin principal tx-sender)
(define-data-var total-registrations uint u0)

;; Private Functions
(define-private (is-owner (data-hash (buff 32)) (caller principal))
  (match (map-get? genetic-registry { data-hash: data-hash })
    entry (is-eq (get owner entry) caller)
    false
  )
)

(define-private (validate-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
    (ok true)
    (err ERR-INVALID-HASH)
  )
)

(define-private (validate-string-len (str (string-utf8 500)) (max-len uint))
  (if (<= (len str) max-len)
    (ok true)
    (err ERR-INVALID-PARAM)
  )
)

;; Public Functions

(define-public (register-genetic-data 
  (data-hash (buff 32)) 
  (data-type (string-utf8 50)) 
  (description (string-utf8 500)))
  (begin
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (try! (validate-hash data-hash))
    (try! (validate-string-len data-type u50))
    (try! (validate-string-len description u500))
    (match (map-get? genetic-registry { data-hash: data-hash })
      entry (err ERR-ALREADY-REGISTERED)
      (begin
        (map-set genetic-registry
          { data-hash: data-hash }
          {
            owner: tx-sender,
            timestamp: block-height,
            data-type: data-type,
            description: description
          }
        )
        (var-set total-registrations (+ (var-get total-registrations) u1))
        (ok true)
      )
    )
  )
)

(define-public (register-new-version 
  (original-hash (buff 32)) 
  (new-hash (buff 32)) 
  (version uint)
  (notes (string-utf8 200)))
  (begin
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (try! (validate-hash original-hash))
    (try! (validate-hash new-hash))
    (try! (validate-string-len notes u200))
    (asserts! (is-owner original-hash tx-sender) (err ERR-NOT-OWNER))
    (map-set data-versions
      { original-hash: original-hash, version: version }
      {
        updated-hash: new-hash,
        update-notes: notes,
        timestamp: block-height
      }
    )
    (ok true)
  )
)

(define-public (grant-license 
  (data-hash (buff 32)) 
  (licensee principal)
  (duration uint)
  (terms (string-utf8 200))
  (access-level (string-utf8 20)))
  (begin
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (try! (validate-hash data-hash))
    (try! (validate-string-len terms u200))
    (try! (validate-string-len access-level u20))
    (asserts! (is-owner data-hash tx-sender) (err ERR-NOT-OWNER))
    (map-set data-licenses
      { data-hash: data-hash, licensee: licensee }
      {
        expiry: (+ block-height duration),
        terms: terms,
        active: true,
        access-level: access-level
      }
    )
    (ok true)
  )
)

(define-public (revoke-license 
  (data-hash (buff 32)) 
  (licensee principal))
  (begin
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (try! (validate-hash data-hash))
    (asserts! (is-owner data-hash tx-sender) (err ERR-NOT-OWNER))
    (match (map-get? data-licenses { data-hash: data-hash, licensee: licensee })
      entry (map-set data-licenses
              { data-hash: data-hash, licensee: licensee }
              (merge entry { active: false }))
      (err ERR-INVALID-PARAM)
    )
    (ok true)
  )
)

(define-public (add-category 
  (data-hash (buff 32))
  (category (string-utf8 50))
  (tags (list 20 (string-utf8 30))))
  (begin
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (try! (validate-hash data-hash))
    (try! (validate-string-len category u50))
    (asserts! (<= (len tags) u20) (err ERR-MAX-TAGS-EXCEEDED))
    (asserts! (is-owner data-hash tx-sender) (err ERR-NOT-OWNER))
    (map-set data-categories
      { data-hash: data-hash }
      { category: category, tags: tags }
    )
    (ok true)
  )
)

(define-public (add-collaborator 
  (data-hash (buff 32))
  (collaborator principal)
  (role (string-utf8 50))
  (permissions (list 10 (string-utf8 20))))
  (begin
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (try! (validate-hash data-hash))
    (try! (validate-string-len role u50))
    (asserts! (<= (len permissions) u10) (err ERR-MAX-PERMS-EXCEEDED))
    (asserts! (is-owner data-hash tx-sender) (err ERR-NOT-OWNER))
    (map-set data-collaborators
      { data-hash: data-hash, collaborator: collaborator }
      {
        role: role,
        permissions: permissions,
        added-at: block-height
      }
    )
    (ok true)
  )
)

(define-public (update-status 
  (data-hash (buff 32))
  (status (string-utf8 20))
  (visibility bool))
  (begin
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (try! (validate-hash data-hash))
    (try! (validate-string-len status u20))
    (asserts! (is-owner data-hash tx-sender) (err ERR-NOT-OWNER))
    (map-set data-status
      { data-hash: data-hash }
      {
        status: status,
        visibility: visibility,
        last-updated: block-height
      }
    )
    (ok true)
  )
)

(define-public (set-revenue-share 
  (data-hash (buff 32))
  (participant principal)
  (percentage uint))
  (begin
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (try! (validate-hash data-hash))
    (asserts! (<= percentage u100) (err ERR-INVALID-SHARE))
    (asserts! (is-owner data-hash tx-sender) (err ERR-NOT-OWNER))
    (map-set revenue-shares
      { data-hash: data-hash, participant: participant }
      {
        percentage: percentage,
        total-received: u0
      }
    )
    (ok true)
  )
)

(define-public (distribute-revenue 
  (data-hash (buff 32))
  (total-amount uint))
  (let 
    (
      (owner (unwrap! (get owner (map-get? genetic-registry { data-hash: data-hash })) (err ERR-INVALID-HASH)))
    )
    (asserts! (not (var-get contract-paused)) (err ERR-PAUSED))
    (asserts! (is-eq tx-sender owner) (err ERR-NOT-OWNER))  ;; Only owner can trigger distribution for now
    ;; In a real setup, this would integrate with token transfers, but mocked here
    (ok true)
  )
)

(define-public (pause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) (err ERR-NOT-AUTHORIZED))
    (var-set contract-paused true)
    (ok true)
  )
)

(define-public (unpause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) (err ERR-NOT-AUTHORIZED))
    (var-set contract-paused false)
    (ok true)
  )
)

(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-admin)) (err ERR-NOT-AUTHORIZED))
    (var-set contract-admin new-admin)
    (ok true)
  )
)

;; Read-Only Functions

(define-read-only (get-genetic-data (data-hash (buff 32)))
  (map-get? genetic-registry { data-hash: data-hash })
)

(define-read-only (get-version (original-hash (buff 32)) (version uint))
  (map-get? data-versions { original-hash: original-hash, version: version })
)

(define-read-only (get-license (data-hash (buff 32)) (licensee principal))
  (let 
    (
      (license (map-get? data-licenses { data-hash: data-hash, licensee: licensee }))
    )
    (if (and (is-some license) (get active (unwrap-panic license)) (> (get expiry (unwrap-panic license)) block-height))
      license
      none
    )
  )
)

(define-read-only (get-category (data-hash (buff 32)))
  (map-get? data-categories { data-hash: data-hash })
)

(define-read-only (get-collaborator (data-hash (buff 32)) (collaborator principal))
  (map-get? data-collaborators { data-hash: data-hash, collaborator: collaborator })
)

(define-read-only (get-status (data-hash (buff 32)))
  (map-get? data-status { data-hash: data-hash })
)

(define-read-only (get-revenue-share (data-hash (buff 32)) (participant principal))
  (map-get? revenue-shares { data-hash: data-hash, participant: participant })
)

(define-read-only (is-contract-paused)
  (var-get contract-paused)
)

(define-read-only (get-total-registrations)
  (var-get total-registrations)
)

(define-read-only (verify-ownership (data-hash (buff 32)) (claimed-owner principal))
  (match (map-get? genetic-registry { data-hash: data-hash })
    entry (is-eq (get owner entry) claimed-owner)
    false
  )
)

(define-read-only (has-valid-license (data-hash (buff 32)) (licensee principal))
  (match (get-license data-hash licensee)
    entry true
    false
  )
)