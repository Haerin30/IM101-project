import React, { useEffect, useState, useRef } from "react";
import { useSession, roles } from "./session";
import { resources, labels, format } from "./resources";
import { Alert, Badge, Editor, Icon, RecordDetails } from "./components";
const isAdmin = (user) => user.role.roleName === roles[0],
    isStaff = (user) => user.role.roleName === roles[1];
function useRoute() {
    const [route, setRoute] = useState(
        () => window.location.hash.replace(/^#\/?/, "") || "overview",
    );
    useEffect(() => {
        const change = () =>
            setRoute(window.location.hash.replace(/^#\/?/, "") || "overview");
        window.addEventListener("hashchange", change);
        return () => window.removeEventListener("hashchange", change);
    }, []);
    return route;
}
export function Login() {
    const { login, notice } = useSession();
    const [email, setEmail] = useState(""),
        [password, setPassword] = useState(""),
        [error, setError] = useState(""),
        [busy, setBusy] = useState(false);
    const pending = useRef(false);
    async function submit(event) {
        event.preventDefault();
        if (pending.current) return;
        pending.current = true;
        setBusy(true);
        setError("");
        try {
            await login(email.trim(), password);
            setPassword("");
        } catch (error) {
            setError(error.message || "Unable to sign in.");
        } finally {
            pending.current = false;
            setBusy(false);
        }
    }
    return (
        <div className="login-layout">
            <aside className="login-story">
                <div className="brand light">
                    <span className="brand-mark">C</span>
                    <div>
                        Campus<span>FACILITIES & SERVICES</span>
                    </div>
                </div>
                <div className="story-copy">
                    <p className="eyebrow">ONE CONNECTED CAMPUS</p>
                    <h1>
                        Better spaces.
                        <br />
                        Smoother days.
                    </h1>
                    <p>
                        A shared workspace for campus facilities, equipment and
                        the people who keep them running.
                    </p>
                    <div className="story-tags">
                        <span>Reserve a space</span>
                        <span>Borrow equipment</span>
                        <span>Keep campus moving</span>
                    </div>
                </div>
                <p className="story-footer">
                    Campus Facility Management System · IM101
                </p>
            </aside>
            <main className="login-main">
                <div className="login-card">
                    <p className="eyebrow">YOUR CAMPUS WORKSPACE</p>
                    <h2>Welcome back</h2>
                    <p className="muted">
                        Sign in with your campus account to continue.
                    </p>
                    {notice && (
                        <p className="notice" role="status">
                            {notice}
                        </p>
                    )}
                    <Alert>{error}</Alert>
                    <form onSubmit={submit}>
                        <label htmlFor="login-email">Email address</label>
                        <input
                            id="login-email"
                            type="email"
                            autoComplete="username"
                            placeholder="you@university.edu"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            required
                            disabled={busy}
                        />
                        <label htmlFor="login-password">Password</label>
                        <input
                            id="login-password"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            required
                            disabled={busy}
                        />
                        <button
                            className="button primary login-submit"
                            disabled={busy}
                        >
                            {busy ? "Signing in…" : "Sign in to workspace"}
                            <span aria-hidden="true">→</span>
                        </button>
                    </form>
                    <p className="login-help">
                        Need an account or password help? Contact your system
                        administrator.
                    </p>
                    <p className="security-note">
                        Your session stays in memory and ends when this page
                        reloads.
                    </p>
                </div>
            </main>
        </div>
    );
}
function useCatalogs(user, api, revision) {
    const [catalogs, setCatalogs] = useState({});
    useEffect(() => {
        if (!user) {
            setCatalogs({});
            return;
        }
        const controller = new AbortController();
        const endpoints = [
            ["buildings", "/buildings?limit=100", "buildings"],
            ["facilities", "/facilities?limit=100", "facilities"],
            ["equipment", "/equipment?limit=100", "equipment"],
            ["types", "/facility-types?limit=100", "facilityTypes"],
            [
                "categories",
                "/equipment-categories?limit=100",
                "equipmentCategories",
            ],
            ["statuses", "/reservation-statuses", "reservationStatuses"],
            ...(isAdmin(user) ? [["staff", "/staff?limit=100", "staff"]] : []),
        ];
        Promise.all(
            endpoints.map(async ([key, path, resultKey]) => [
                key,
                (await api.request(path, { signal: controller.signal }))[
                    resultKey
                ],
            ]),
        )
            .then((entries) => {
                if (!controller.signal.aborted)
                    setCatalogs(Object.fromEntries(entries));
            })
            .catch(() => {
                if (!controller.signal.aborted)
                    setCatalogs({ unavailable: true });
            });
        return () => controller.abort();
    }, [user, api, revision]);
    return catalogs;
}
function Dashboard() {
    const { api, user } = useSession();
    const [data, setData] = useState(null),
        [error, setError] = useState(""),
        [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setError("");
        Promise.all([
            api.request("/overview", { signal: controller.signal }),
            api.request("/reservations?limit=5", { signal: controller.signal }),
            api.request("/loans?limit=5", { signal: controller.signal }),
        ])
            .then(([overview, reservations, loans]) => {
                if (!controller.signal.aborted)
                    setData({
                        overview: overview.overview,
                        reservations: reservations.reservations,
                        loans: loans.loans,
                    });
            })
            .catch((error) => {
                if (!controller.signal.aborted) setError(error.message);
            });
        return () => controller.abort();
    }, [api, revision]);
    return (
        <>
            <div className="page-heading">
                <div>
                    <p className="eyebrow">CAMPUS AT A GLANCE</p>
                    <h1>Welcome back, {user.fname}.</h1>
                    <p className="muted">
                        Here’s what is in your campus workspace.
                    </p>
                </div>
                <button
                    className="button secondary"
                    onClick={() => setRevision(revision + 1)}
                >
                    Refresh
                </button>
            </div>
            <Alert>{error}</Alert>
            {!data && !error ? (
                <p role="status">Loading your workspace…</p>
            ) : (
                data && (
                    <>
                        <div className="metric-grid">
                            {Object.entries(data.overview).map(
                                ([key, value]) => (
                                    <a
                                        href={"#/" + key}
                                        className="metric"
                                        key={key}
                                    >
                                        <span className="metric-icon">
                                            <Icon name={key} />
                                        </span>
                                        <div>
                                            <p>
                                                {resources[key]?.title || key}
                                            </p>
                                            <strong>
                                                {Number.isFinite(value)
                                                    ? value.toLocaleString()
                                                    : "—"}
                                            </strong>
                                        </div>
                                        <span className="metric-arrow">↗</span>
                                    </a>
                                ),
                            )}
                        </div>
                        <div className="dashboard-grid">
                            <section className="panel">
                                <div className="panel-title">
                                    <h2>Recent reservations</h2>
                                    <a href="#/reservations">View all →</a>
                                </div>
                                {data.reservations.length ? (
                                    data.reservations.map((row) => (
                                        <div
                                            className="activity"
                                            key={row.reservationId}
                                        >
                                            <span className="activity-icon">
                                                <Icon name="reservations" />
                                            </span>
                                            <div>
                                                <strong>{row.purpose}</strong>
                                                <p>
                                                    Facility #{row.facilityId} ·{" "}
                                                    {format(
                                                        row.startDatetime,
                                                        "startDatetime",
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <Empty
                                        title="No reservations yet"
                                        text="Your authorized booking history will appear here."
                                    />
                                )}
                            </section>
                            <section className="panel">
                                <div className="panel-title">
                                    <h2>Recent equipment loans</h2>
                                    <a href="#/loans">View all →</a>
                                </div>
                                {data.loans.length ? (
                                    data.loans.map((row) => (
                                        <div
                                            className="activity"
                                            key={row.loanId}
                                        >
                                            <span className="activity-icon">
                                                <Icon name="loans" />
                                            </span>
                                            <div>
                                                <strong>
                                                    Loan #{row.loanId}
                                                </strong>
                                                <p>
                                                    Due{" "}
                                                    {format(
                                                        row.dueDate,
                                                        "dueDate",
                                                    )}
                                                </p>
                                            </div>
                                            <Badge value={row.loanStatus} />
                                        </div>
                                    ))
                                ) : (
                                    <Empty
                                        title="No borrowing requests"
                                        text="Request equipment from the loans workspace."
                                    />
                                )}
                            </section>
                        </div>
                        <div className="workspace-note">
                            <Icon name="facilities" />
                            <div>
                                <strong>Plan your next campus activity.</strong>
                                <p>
                                    Browse facilities and equipment, then submit
                                    a request for review.
                                </p>
                            </div>
                            <a className="button secondary" href="#/facilities">
                                Browse facilities →
                            </a>
                        </div>
                    </>
                )
            )}
        </>
    );
}
function Empty({
    title = "No records found",
    text = "Records you are allowed to view will appear here.",
}) {
    return (
        <div className="empty-state">
            <span className="empty-icon">◇</span>
            <h3>{title}</h3>
            <p>{text}</p>
        </div>
    );
}
function ResourcePage({ name, catalogs, onChange }) {
    const resource = resources[name],
        { api, user } = useSession();
    const [rows, setRows] = useState([]),
        [page, setPage] = useState(1),
        [hasMore, setHasMore] = useState(false),
        [filter, setFilter] = useState(""),
        [loading, setLoading] = useState(true),
        [error, setError] = useState(""),
        [revision, setRevision] = useState(0),
        [modal, setModal] = useState(null),
        [details, setDetails] = useState(null),
        [toast, setToast] = useState("");
    const refresh = () => setRevision((value) => value + 1);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError("");
        const query = new URLSearchParams({ page: String(page), limit: "20" });
        if (filter && ["loans", "maintenance"].includes(name))
            query.set("status", filter);
        if (filter && name === "assignments") query.set("active", filter);
        api.request(resource.path + "?" + query, { signal: controller.signal })
            .then((data) => {
                if (!controller.signal.aborted) {
                    setRows(data[resource.key]);
                    setHasMore(data.pagination.hasMore);
                }
            })
            .catch((error) => {
                if (!controller.signal.aborted) setError(error.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [api, resource, name, page, filter, revision]);
    const enriched = rows.map((row) => ({
        ...row,
        ...(name === "reservations"
            ? {
                  statusName:
                      catalogs.statuses?.find(
                          (status) => status.statusId === row.statusId,
                      )?.statusName || `Status #${row.statusId}`,
              }
            : {}),
    }));
    function edit(row) {
        setModal({
            title: row
                ? `Edit ${resource.singular}`
                : `New ${resource.singular}`,
            fields: resource.fields,
            initial: row || {},
            confirmLabel: row ? "Save changes" : "Submit request",
            onSubmit: async (data) => {
                if (name === "maintenance") {
                    const { targetKind, targetId, ...rest } = data;
                    data = { ...rest, [targetKind]: targetId };
                }
                await api.request(
                    resource.path + (row ? "/" + row[resource.id] : ""),
                    { method: row ? "PUT" : "POST", body: data },
                );
                setToast("Saved successfully.");
                refresh();
                onChange();
            },
            loanItems: name === "loans",
            notice:
                name === "reservations"
                    ? `Times use ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Maximum 8 hours; both endpoints within 90 days. Pending requests do not guarantee a booking.`
                    : name === "loans"
                      ? "Pending requests do not reserve stock. Due dates must be future and within 90 days."
                      : name === "assignments"
                        ? "Assignment dates use UTC calendar days. End assignments to retain their history."
                        : null,
        });
        if (name === "loans")
            setModal((previous) => ({
                ...previous,
                fields: [["dueDate", "Due date & time", "datetime"]],
            }));
    }
    async function view(row) {
        try {
            const data = await api.request(
                resource.path + "/" + row[resource.id],
            );
            setDetails({
                ...data[
                    name === "maintenance"
                        ? "maintenanceRequest"
                        : resource.singular
                ],
                ...(name === "reservations"
                    ? { statusName: row.statusName }
                    : {}),
            });
        } catch (error) {
            setError(error.message);
        }
    }
    function action(row, type) {
        const id = row[resource.id];
        let fields = [],
            method = "POST",
            path = `${resource.path}/${id}/${type}`,
            bodyTransform = (value) => value,
            notice = "Review this record before confirming.";
        if (type === "delete") {
            method = "DELETE";
            path = resource.path + "/" + id;
            notice =
                "This permanently deletes this management record if it has no dependent history. This cannot be undone.";
        }
        if (type === "return") {
            notice =
                "Confirm physical return of every item. Stock is restored exactly once. Damaged returns quarantine the equipment pool.";
        }
        if (type === "assign") {
            fields = [["staffId", "Staff user ID", "number", "staff"]];
            notice = "Assign this request to active maintenance staff.";
        }
        if (type === "claim") {
            path = `${resource.path}/${id}/assign`;
            bodyTransform = () => ({ staffId: user.userId });
            notice = "Assign this unclaimed request to yourself.";
        }
        if (type === "start" || type === "resolve") {
            path = `${resource.path}/${id}/progress`;
            fields = [["actionTaken", "Maintenance action", "textarea", 2000]];
            bodyTransform = (data) => ({
                ...data,
                status: type === "start" ? "In Progress" : "Resolved",
            });
        }
        if (type === "log") {
            path = `${resource.path}/${id}/logs`;
            fields = [["actionTaken", "Maintenance action", "textarea", 2000]];
        }
        if (type === "priority") {
            path = `${resource.path}/${id}/priority`;
            method = "PATCH";
            fields = [
                ["priority", "Priority", "select", ["Normal", "Low", "High"]],
            ];
        }
        if (type === "assignmentEdit") {
            method = "PATCH";
            path = resource.path + "/" + id;
            fields = [
                [
                    "assignedRole",
                    "Assigned role",
                    "select",
                    ["Custodian", "Maintenance Technician"],
                ],
                ["shift", "Shift", "select", ["", "Day", "Evening", "Night"]],
            ];
        }
        if (type === "end") {
            fields = [["unassignedDate", "End date (UTC)", "date"]];
            notice = "End this assignment without deleting its history.";
        }
        if (type === "approve")
            notice =
                name === "loans"
                    ? "Approval reserves the requested equipment now."
                    : "Approval blocks this facility time slot after conflict checks.";
        if (type === "reject")
            notice =
                "Reject this Pending request. This transition cannot be reopened.";
        if (type === "cancel")
            notice =
                "Cancel this unstarted reservation. It cannot be reopened.";
        const captions = {
            approve: "Approve",
            reject: "Reject",
            cancel: "Cancel reservation",
            return: "Record return",
            assign: "Assign maintenance",
            claim: "Claim maintenance",
            start: "Start work",
            resolve: "Resolve request",
            log: "Record maintenance action",
            priority: "Change priority",
            assignmentEdit: "Update assignment",
            end: "End assignment",
            delete: "Delete",
        };
        setModal({
            title: `${captions[type]} · ${resource.singular} #${id}`,
            fields,
            initial: row,
            returnItems: type === "return" ? row.items : null,
            notice,
            confirmLabel: `Confirm ${type === "delete" ? "deletion" : captions[type].toLowerCase()}`,
            onSubmit: async (value) => {
                await api.request(path, {
                    method,
                    ...(type === "delete"
                        ? {}
                        : { body: bodyTransform(value) }),
                });
                setToast("Operation confirmed.");
                refresh();
                onChange();
            },
        });
    }
    function actions(row) {
        const list = [];
        if (resource.manage && isAdmin(user)) {
            list.push(["edit", "Edit"], ["delete", "Delete"]);
        }
        if (name === "reservations") {
            if (
                isAdmin(user) &&
                row.requestedBy !== user.userId &&
                row.statusName === "Pending"
            )
                list.push(["approve", "Approve"], ["reject", "Reject"]);
            if (
                (isAdmin(user) || row.requestedBy === user.userId) &&
                ["Pending", "Approved"].includes(row.statusName) &&
                new Date(row.startDatetime) > new Date()
            )
                list.push(["cancel", "Cancel"]);
        }
        if (
            name === "loans" &&
            (isAdmin(user) || isStaff(user)) &&
            row.userId !== user.userId
        ) {
            if (row.loanStatus === "Pending")
                list.push(["approve", "Approve"], ["reject", "Reject"]);
            if (row.loanStatus === "Approved") list.push(["return", "Return"]);
        }
        if (name === "maintenance" && row.status !== "Resolved") {
            const worker =
                isAdmin(user) ||
                (isStaff(user) && row.assignedStaffId === user.userId);
            if (isAdmin(user)) list.push(["assign", "Assign"]);
            else if (isStaff(user) && row.assignedStaffId === null)
                list.push(["claim", "Claim"]);
            if (worker) {
                if (row.status === "Open") list.push(["start", "Start"]);
                if (row.status === "In Progress")
                    list.push(["log", "Add action"], ["resolve", "Resolve"]);
                list.push(["priority", "Priority"]);
            }
        }
        if (name === "assignments" && isAdmin(user) && !row.unassignedDate)
            list.push(["assignmentEdit", "Update"], ["end", "End"]);
        return list;
    }
    const canCreate = resource.manage
        ? isAdmin(user)
        : name === "assignments"
          ? isAdmin(user)
          : true;
    return (
        <>
            <div className="page-heading">
                <div>
                    <p className="eyebrow">CAMPUS WORKSPACE</p>
                    <h1>{resource.title}</h1>
                    <p className="muted">{resource.description}</p>
                </div>
                {canCreate && (
                    <button
                        className="button primary"
                        onClick={() => edit(null)}
                    >
                        +{" "}
                        {resource.manage
                            ? "Add " + resource.singular
                            : name === "assignments"
                              ? "Create assignment"
                              : "New " + resource.singular}
                    </button>
                )}
            </div>
            <Alert>{error}</Alert>
            {toast && (
                <div className="success-banner" role="status">
                    {toast}
                </div>
            )}
            <section className="panel table-panel">
                <div className="table-toolbar">
                    <div>
                        <strong>
                            {isAdmin(user)
                                ? "Management"
                                : name === "loans" && isStaff(user)
                                  ? "Borrowing review"
                                  : "Your workspace"}
                        </strong>
                        <span className="muted"> · page {page}</span>
                    </div>
                    <div className="toolbar-actions">
                        {["loans", "maintenance", "assignments"].includes(
                            name,
                        ) && (
                            <label className="filter-label">
                                Filter
                                <select
                                    aria-label="Filter records"
                                    value={filter}
                                    onChange={(event) => {
                                        setFilter(event.target.value);
                                        setPage(1);
                                    }}
                                >
                                    <option value="">All history</option>
                                    {(name === "loans"
                                        ? [
                                              "Pending",
                                              "Approved",
                                              "Rejected",
                                              "Returned",
                                          ]
                                        : name === "maintenance"
                                          ? ["Open", "In Progress", "Resolved"]
                                          : ["true", "false"]
                                    ).map((value) => (
                                        <option key={value} value={value}>
                                            {value === "true"
                                                ? "Active"
                                                : value === "false"
                                                  ? "Ended"
                                                  : value}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                        <button
                            className="button secondary small"
                            onClick={refresh}
                            disabled={loading}
                        >
                            Refresh
                        </button>
                    </div>
                </div>
                {loading ? (
                    <div className="loading-state" role="status">
                        Loading {resource.title.toLowerCase()}…
                    </div>
                ) : error ? (
                    <Empty
                        title="Unable to load records"
                        text="Use Refresh to try the read request again."
                    />
                ) : !rows.length ? (
                    <Empty
                        text={
                            filter
                                ? "No records match this filter."
                                : "Your authorized records will appear here."
                        }
                    />
                ) : (
                    <div className="table-scroll">
                        <table>
                            <thead>
                                <tr>
                                    {resource.columns.map((key) => (
                                        <th key={key}>{labels[key] || key}</th>
                                    ))}
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {enriched.map((row) => (
                                    <tr key={row[resource.id]}>
                                        {resource.columns.map((key) => (
                                            <td key={key}>
                                                {[
                                                    "status",
                                                    "statusName",
                                                    "loanStatus",
                                                    "conditionStatus",
                                                    "priority",
                                                ].includes(key) ? (
                                                    <Badge value={row[key]} />
                                                ) : (
                                                    <span
                                                        className="cell-text"
                                                        title={format(
                                                            row[key],
                                                            key,
                                                        )}
                                                    >
                                                        {format(row[key], key)}
                                                    </span>
                                                )}
                                            </td>
                                        ))}
                                        <td>
                                            <div className="row-actions">
                                                <button
                                                    onClick={() => view(row)}
                                                >
                                                    Details
                                                </button>
                                                {actions(row).map(
                                                    ([type, label]) => (
                                                        <button
                                                            key={type}
                                                            className={
                                                                [
                                                                    "delete",
                                                                    "reject",
                                                                    "cancel",
                                                                ].includes(type)
                                                                    ? "danger-link"
                                                                    : ""
                                                            }
                                                            onClick={() =>
                                                                type === "edit"
                                                                    ? edit(row)
                                                                    : action(
                                                                          row,
                                                                          type,
                                                                      )
                                                            }
                                                        >
                                                            {label}
                                                        </button>
                                                    ),
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="pagination">
                    <span>
                        Up to 20 records per page · visibility follows your role
                    </span>
                    <div>
                        <button
                            className="button secondary small"
                            disabled={page === 1 || loading}
                            onClick={() => setPage(page - 1)}
                        >
                            ← Previous
                        </button>
                        <button
                            className="button secondary small"
                            disabled={!hasMore || loading}
                            onClick={() => setPage(page + 1)}
                        >
                            Next →
                        </button>
                    </div>
                </div>
            </section>
            {modal && (
                <Editor
                    {...modal}
                    catalogs={catalogs}
                    onClose={() => setModal(null)}
                />
            )}{" "}
            {details && (
                <RecordDetails
                    row={details}
                    catalogs={catalogs}
                    onClose={() => setDetails(null)}
                />
            )}
        </>
    );
}
export default function App() {
    const { user, api, logout } = useSession();
    const route = useRoute();
    const [mobile, setMobile] = useState(false),
        [revision, setRevision] = useState(0);
    const catalogs = useCatalogs(user, api, revision);
    useEffect(() => setMobile(false), [route]);
    if (!user) return <Login />;
    const allowed = route !== "assignments" || isAdmin(user) || isStaff(user);
    return (
        <div id="workspace" className="workspace">
            <aside className={`sidebar ${mobile ? "open" : ""}`}>
                <a href="#/overview" className="brand">
                    <span className="brand-mark">C</span>
                    <div>
                        Campus<span>FACILITIES & SERVICES</span>
                    </div>
                </a>
                <p className="nav-label">WORKSPACE</p>
                <nav
                    aria-label="Main navigation"
                    onClick={() => setMobile(false)}
                >
                    <a
                        className={route === "overview" ? "active" : ""}
                        href="#/overview"
                    >
                        <Icon />
                        Overview
                    </a>
                    {Object.entries(resources)
                        .filter(
                            ([key]) =>
                                key !== "assignments" ||
                                isAdmin(user) ||
                                isStaff(user),
                        )
                        .map(([key, resource]) => (
                            <a
                                className={route === key ? "active" : ""}
                                key={key}
                                href={"#/" + key}
                            >
                                <Icon name={key} />
                                {resource.title}
                            </a>
                        ))}
                </nav>
                <div className="sidebar-foot">
                    <span className="access-dot" /> Role-based campus access
                    <small>Campus Facility Management · IM101</small>
                </div>
            </aside>
            <div className="workspace-content">
                <header className="topbar">
                    <div className="topbar-left">
                        <button
                            className="icon-button mobile-menu"
                            aria-label="Toggle navigation"
                            aria-expanded={mobile}
                            onClick={() => setMobile(!mobile)}
                        >
                            ☰
                        </button>
                        <span className="breadcrumb">
                            Campus services <span>/</span>{" "}
                            {Object.hasOwn(resources, route)
                                ? resources[route].title
                                : "Overview"}
                        </span>
                    </div>
                    <details className="account">
                        <summary aria-label="Account menu">
                            <span className="avatar">
                                {user.fname?.slice(0, 1)}
                            </span>
                            <span>
                                <strong>
                                    {user.fname} {user.lname}
                                </strong>
                                <small>{user.role.roleName}</small>
                            </span>
                            <span aria-hidden="true">⌄</span>
                        </summary>
                        <div className="account-menu">
                            <strong>Your account</strong>
                            <p>{user.email}</p>
                            <button
                                className="button secondary"
                                onClick={logout}
                            >
                                Sign out
                            </button>
                        </div>
                    </details>
                </header>
                <main className="main-content">
                    {!allowed ? (
                        <Empty
                            title="Access restricted"
                            text="This workspace is not available for your role."
                        />
                    ) : route === "overview" ? (
                        <Dashboard />
                    ) : Object.hasOwn(resources, route) ? (
                        <ResourcePage
                            key={route}
                            name={route}
                            catalogs={catalogs}
                            onChange={() => setRevision((value) => value + 1)}
                        />
                    ) : (
                        <Empty
                            title="Page not found"
                            text="Choose a workspace from the navigation."
                        />
                    )}
                </main>
                <footer className="page-footer">
                    Campus Facility Management System{" "}
                    <span>Secure, role-based workspace</span>
                </footer>
            </div>
        </div>
    );
}
