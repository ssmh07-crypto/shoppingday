export default function AdminLoading() {
  return (
    <main
      className="inventory-main"
      aria-busy="true"
      aria-label="화면 불러오는 중"
    >
      <div className="inventory-loading" role="status">
        <span className="inventory-eyebrow">쇼핑데이</span>
        <h1>작업 화면을 불러오고 있습니다</h1>
        <p>저장된 상품과 작업 상태를 확인하고 있습니다.</p>
        <progress aria-label="불러오는 중" />
      </div>
    </main>
  );
}
