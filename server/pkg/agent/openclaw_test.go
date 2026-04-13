package agent

import (
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

func TestNewReturnsOpenclawBackend(t *testing.T) {
	t.Parallel()
	b, err := New("openclaw", Config{ExecutablePath: "/nonexistent/openclaw"})
	if err != nil {
		t.Fatalf("New(openclaw) error: %v", err)
	}
	if _, ok := b.(*openclawBackend); !ok {
		t.Fatalf("expected *openclawBackend, got %T", b)
	}
}

// ── Legacy result format tests (processOutput with final JSON blob) ──

func TestOpenclawProcessOutputHappyPath(t *testing.T) {
	t.Parallel()

	b := &openclawBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 256)

	result := openclawResult{
		Payloads: []openclawPayload{{Text: "Hello from openclaw"}},
		Meta: openclawMeta{
			DurationMs: 1234,
			AgentMeta: map[string]any{
				"sessionId": "ses_abc",
				"usage": map[string]any{
					"input":      float64(100),
					"output":     float64(50),
					"cacheRead":  float64(10),
					"cacheWrite": float64(5),
				},
			},
		},
	}
	data, _ := json.Marshal(result)

	res := b.processOutput(strings.NewReader(string(data)), ch)

	if res.status != "completed" {
		t.Errorf("status: got %q, want %q", res.status, "completed")
	}
	if res.output != "Hello from openclaw" {
		t.Errorf("output: got %q, want %q", res.output, "Hello from openclaw")
	}
	if res.sessionID != "ses_abc" {
		t.Errorf("sessionID: got %q, want %q", res.sessionID, "ses_abc")
	}
	if res.usage.InputTokens != 100 {
		t.Errorf("input tokens: got %d, want 100", res.usage.InputTokens)
	}
	if res.usage.OutputTokens != 50 {
		t.Errorf("output tokens: got %d, want 50", res.usage.OutputTokens)
	}

	close(ch)
	var msgs []Message
	for m := range ch {
		msgs = append(msgs, m)
	}
	if len(msgs) != 1 || msgs[0].Type != MessageText {
		t.Errorf("expected 1 text message, got %d", len(msgs))
	}
	if msgs[0].Content != "Hello from openclaw" {
		t.Errorf("message content: got %q", msgs[0].Content)
	}
}

func TestOpenclawProcessOutputMultiplePayloads(t *testing.T) {
	t.Parallel()

	b := &openclawBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 256)

	result := openclawResult{
		Payloads: []openclawPayload{
			{Text: "First"},
			{Text: "Second"},
		},
	}
	data, _ := json.Marshal(result)

	res := b.processOutput(strings.NewReader(string(data)), ch)

	if res.output != "FirstSecond" {
		t.Errorf("output: got %q, want %q", res.output, "FirstSecond")
	}

	close(ch)
	var msgs []Message
	for m := range ch {
		msgs = append(msgs, m)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 text messages, got %d", len(msgs))
	}
	if msgs[0].Content != "First" {
		t.Errorf("msg[0]: got %q, want %q", msgs[0].Content, "First")
	}
	if msgs[1].Content != "Second" {
		t.Errorf("msg[1]: got %q, want %q", msgs[1].Content, "Second")
	}
}

func TestOpenclawProcessOutputEmptyPayloads(t *testing.T) {
	t.Parallel()

	b := &openclawBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 256)

	result := openclawResult{Payloads: []openclawPayload{}}
	data, _ := json.Marshal(result)

	res := b.processOutput(strings.NewReader(string(data)), ch)

	if res.status != "completed" {
		t.Errorf("status: got %q, want %q", res.status, "completed")
	}
	if res.output != "" {
		t.Errorf("output: got %q, want empty", res.output)
	}

	close(ch)
	var msgs []Message
	for m := range ch {
		msgs = append(msgs, m)
	}
	if len(msgs) != 0 {
		t.Errorf("expected 0 messages, got %d", len(msgs))
	}
}

func TestOpenclawProcessOutputWithLeadingLogLines(t *testing.T) {
	t.Parallel()

	b := &openclawBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 256)

	result := openclawResult{
		Payloads: []openclawPayload{{Text: "Done"}},
	}
	data, _ := json.Marshal(result)
	input := "some log line\nanother log\n" + string(data)

	res := b.processOutput(strings.NewReader(input), ch)

	if res.status != "completed" {
		t.Errorf("status: got %q, want %q", res.status, "completed")
	}
	if res.output != "Done" {
		t.Errorf("output: got %q, want %q", res.output, "Done")
	}

	close(ch)
}

func TestOpenclawProcessOutputIgnoresTrailingLogLinesAfterJSON(t *testing.T) {
	t.Parallel()

	b := &openclawBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 256)

	result := openclawResult{
		Payloads: []openclawPayload{{Text: "Done"}},
	}
	data, _ := json.Marshal(result)
	input := string(data) + "\npost-result log line that should not block parsing"

	res := b.processOutput(strings.NewReader(input), ch)

	if res.status != "completed" {
		t.Errorf("status: got %q, want %q", res.status, "completed")
	}
	if res.output != "Done" {
		t.Errorf("output: got %q, want %q", res.output, "Done")
	}

	close(ch)
}

func TestOpenclawProcessOutputNoJSON(t *testing.T) {
	t.Parallel()

	b := &openclawBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 256)

	res := b.processOutput(strings.NewReader("not json at all"), ch)

	if res.status != "completed" {
		t.Errorf("status: got %q, want %q", res.status, "completed")
	}
	if res.output != "not json at all" {
		t.Errorf("output: got %q", res.output)
	}

	close(ch)
}

func TestOpenclawProcessOutputEmptyInput(t *testing.T) {
	t.Parallel()

	b := &openclawBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 256)

	res := b.processOutput(strings.NewReader(""), ch)

	if res.status != "failed" {
		t.Errorf("status: got %q, want %q", res.status, "failed")
	}
	if res.errMsg != "openclaw returned no parseable output" {
		t.Errorf("errMsg: got %q", res.errMsg)
	}

	close(ch)
}

func TestOpenclawProcessOutputReadError(t *testing.T) {
	t.Parallel()

	b := &openclawBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 256)

	res := b.processOutput(&ioErrReader{data: ""}, ch)

	if res.status != "failed" {
		t.Errorf("status: got %q, want %q", res.status, "failed")
	}
	if !strings.Contains(res.errMsg, "read stderr") {
		t.Errorf("errMsg: got %q, want it to contain 'read stderr'", res.errMsg)
	}

	close(ch)
}

func TestOpenclawProcessOutputWithBracesInLogLines(t *testing.T) {
	t.Parallel()

	b := &openclawBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 256)

	result := openclawResult{
		Payloads: []openclawPayload{{Text: "Final answer"}},
		Meta:     openclawMeta{DurationMs: 500},
	}
	data, _ := json.Marshal(result)
	// Simulate error line containing braces before the real JSON (the exact bug scenario)
	input := `[tools] exec failed: complex interpreter invocation detected. raw_params={"command":"echo hello"}` + "\n" + string(data)

	res := b.processOutput(strings.NewReader(input), ch)

	if res.status != "completed" {
		t.Errorf("status: got %q, want %q", res.status, "completed")
	}
	if res.output != "Final answer" {
		t.Errorf("output: got %q, want %q", res.output, "Final answer")
	}

	close(ch)
}

// ── Streaming NDJSON event tests ──

func TestOpenclawStreamingTextEvents(t *testing.T) {
	t.Parallel()

	b := &openclawBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 256)

	lines := []string{
		`{"type":"text","text":"Hello "}`,
		`{"type":"text","text":"world"}`,
	}
	input := strings.Join(lines, "\n")

	res := b.processOutput(strings.NewReader(input), ch)

	if res.status != "completed" {
		t.Errorf("status: got %q, want %q", res.status, "completed")
	}
	if res.output != "Hello world" {
		t.Errorf("output: got %q, want %q", res.output, "Hello world")
	}

	close(ch)
	var msgs []Message
	for m := range ch {
		msgs = append(msgs, m)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	if msgs[0].Type != MessageText || msgs[0].Content != "Hello " {
		t.Errorf("msg[0]: type=%s content=%q", msgs[0].Type, msgs[0].Content)
	}
	if msgs[1].Type != MessageText || msgs[1].Content != "world" {
		t.Errorf("msg[1]: type=%s content=%q", msgs[1].Type, msgs[1].Content)
	}
}

func TestOpenclawStreamingToolUseEvents(t *testing.T) {
	t.Parallel()

	b := &openclawBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 256)

	lines := []string{
		`{"type":"tool_use","tool":"bash","callId":"call_1","input":{"command":"ls -la"}}`,
		`{"type":"tool_result","tool":"bash","callId":"call_1","text":"total 42\ndrwxr-xr-x"}`,
		`{"type":"text","text":"Listed files."}`,
	}
	input := strings.Join(lines, "\n")

	res := b.processOutput(strings.NewReader(input), ch)

	if res.status != "completed" {
		t.Errorf("status: got %q, want %q", res.status, "completed")
	}

	close(ch)
	var msgs []Message
	for m := range ch {
		msgs = append(msgs, m)
	}
	if len(msgs) != 3 {
		t.Fatalf("expected 3 messages, got %d", len(msgs))
	}

	// tool_use
	if msgs[0].Type != MessageToolUse {
		t.Errorf("msg[0] type: got %s, want tool-use", msgs[0].Type)
	}
	if msgs[0].Tool != "bash" {
		t.Errorf("msg[0] tool: got %q, want %q", msgs[0].Tool, "bash")
	}
	if msgs[0].CallID != "call_1" {
		t.Errorf("msg[0] callID: got %q, want %q", msgs[0].CallID, "call_1")
	}
	if msgs[0].Input["command"] != "ls -la" {
		t.Errorf("msg[0] input: got %v", msgs[0].Input)
	}

	// tool_result
	if msgs[1].Type != MessageToolResult {
		t.Errorf("msg[1] type: got %s, want tool-result", msgs[1].Type)
	}
	if msgs[1].CallID != "call_1" {
		t.Errorf("msg[1] callID: got %q", msgs[1].CallID)
	}
	if msgs[1].Output != "total 42\ndrwxr-xr-x" {
		t.Errorf("msg[1] output: got %q", msgs[1].Output)
	}

	// text
	if msgs[2].Type != MessageText || msgs[2].Content != "Listed files." {
		t.Errorf("msg[2]: type=%s content=%q", msgs[2].Type, msgs[2].Content)
	}
}

func TestOpenclawStreamingErrorEvent(t *testing.T) {
	t.Parallel()

	b := &openclawBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 256)

	lines := []string{
		`{"type":"text","text":"Starting..."}`,
		`{"type":"error","text":"model not found: gpt-99"}`,
	}
	input := strings.Join(lines, "\n")

	res := b.processOutput(strings.NewReader(input), ch)

	if res.status != "failed" {
		t.Errorf("status: got %q, want %q", res.status, "failed")
	}
	if res.errMsg != "model not found: gpt-99" {
		t.Errorf("errMsg: got %q", res.errMsg)
	}

	close(ch)
	var msgs []Message
	for m := range ch {
		msgs = append(msgs, m)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	if msgs[1].Type != MessageError {
		t.Errorf("msg[1] type: got %s, want error", msgs[1].Type)
	}
}

func TestOpenclawStreamingStepFinishUsage(t *testing.T) {
	t.Parallel()

	b := &openclawBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 256)

	lines := []string{
		`{"type":"step_start"}`,
		`{"type":"text","text":"Done"}`,
		`{"type":"step_finish","usage":{"input":200,"output":100,"cacheRead":50,"cacheWrite":25}}`,
	}
	input := strings.Join(lines, "\n")

	res := b.processOutput(strings.NewReader(input), ch)

	if res.usage.InputTokens != 200 {
		t.Errorf("input tokens: got %d, want 200", res.usage.InputTokens)
	}
	if res.usage.OutputTokens != 100 {
		t.Errorf("output tokens: got %d, want 100", res.usage.OutputTokens)
	}
	if res.usage.CacheReadTokens != 50 {
		t.Errorf("cache read: got %d, want 50", res.usage.CacheReadTokens)
	}
	if res.usage.CacheWriteTokens != 25 {
		t.Errorf("cache write: got %d, want 25", res.usage.CacheWriteTokens)
	}

	close(ch)
}

func TestOpenclawStreamingSessionID(t *testing.T) {
	t.Parallel()

	b := &openclawBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 256)

	lines := []string{
		`{"type":"text","text":"Hi","sessionId":"ses_stream_123"}`,
	}
	input := strings.Join(lines, "\n")

	res := b.processOutput(strings.NewReader(input), ch)

	if res.sessionID != "ses_stream_123" {
		t.Errorf("sessionID: got %q, want %q", res.sessionID, "ses_stream_123")
	}

	close(ch)
}

func TestOpenclawStreamingMixedWithLogLines(t *testing.T) {
	t.Parallel()

	b := &openclawBackend{cfg: Config{Logger: slog.Default()}}
	ch := make(chan Message, 256)

	lines := []string{
		"[info] initializing agent...",
		`{"type":"text","text":"Hello"}`,
		"[debug] tool exec completed",
		`{"type":"text","text":" world"}`,
	}
	input := strings.Join(lines, "\n")

	res := b.processOutput(strings.NewReader(input), ch)

	if res.status != "completed" {
		t.Errorf("status: got %q, want %q", res.status, "completed")
	}
	if res.output != "Hello world" {
		t.Errorf("output: got %q, want %q", res.output, "Hello world")
	}

	close(ch)
	var msgs []Message
	for m := range ch {
		msgs = append(msgs, m)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 text messages, got %d", len(msgs))
	}
}

// ── openclawInt64 tests ──

func TestOpenclawInt64Float(t *testing.T) {
	t.Parallel()
	data := map[string]any{"count": float64(42)}
	if got := openclawInt64(data, "count"); got != 42 {
		t.Errorf("got %d, want 42", got)
	}
}

func TestOpenclawInt64Missing(t *testing.T) {
	t.Parallel()
	data := map[string]any{}
	if got := openclawInt64(data, "count"); got != 0 {
		t.Errorf("got %d, want 0", got)
	}
}

func TestOpenclawInt64Nil(t *testing.T) {
	t.Parallel()
	data := map[string]any{"count": "not a number"}
	if got := openclawInt64(data, "count"); got != 0 {
		t.Errorf("got %d, want 0", got)
	}
}
