/* global ShoppingdayCredentialVault */
const vault = ShoppingdayCredentialVault;
const byId = (id) => document.getElementById(id);
async function refresh(message = "") {
  const state = await vault.status();
  byId("fields").disabled = !state.unlocked;
  byId("status").textContent =
    message ||
    (state.unlocked
      ? `잠금 해제됨 · 저장된 도매처: ${state.providers.map((key) => (key === "zicgam" ? "직감" : "이불삼촌")).join(", ") || "없음"}`
      : "보관함이 잠겨 있습니다.");
}
byId("unlock").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    await vault.unlock(byId("passphrase").value);
    await refresh();
  } catch (error) {
    await refresh(error.message);
  } finally {
    byId("passphrase").value = "";
    button.disabled = false;
  }
});
byId("credentials").addEventListener("submit", async (event) => {
  event.preventDefault();
  byId("fields").disabled = true;
  try {
    await vault.save(
      byId("provider").value,
      byId("username").value,
      byId("password").value,
    );
    byId("username").value = "";
    await refresh("로그인 정보를 암호화해 저장했습니다.");
  } catch (error) {
    await refresh(error.message);
  } finally {
    byId("password").value = "";
  }
});
byId("lock").addEventListener("click", async () => {
  await vault.lock();
  await refresh();
});
byId("clear").addEventListener("click", async () => {
  if (
    confirm(
      "이 PC에 저장한 도매처 로그인 정보를 모두 삭제할까요? 복구할 수 없습니다.",
    )
  ) {
    await vault.clear();
    await refresh("보관함을 삭제했습니다.");
  }
});
void refresh();
